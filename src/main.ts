import {
    App,
    EventRef,
    MarkdownView,
    Notice,
    debounce,
    Constructor,
    Plugin,
    WorkspaceLeaf,
    View,
    TFile,
} from "obsidian";
import { Block, Section, Heading, EmbedOrLinkItem, Reference } from "./types";
import { indexBlockReferences, getPages, cleanHeader } from "./indexer";
import {
    BlockRefCountSettingTab,
    getSettings,
    updateSettings,
} from "./settings";

/**
 * BlockRefCounter Plugin
 * by shabegom and Murf
 *
 * Iterates through the cache of all notes in a vault and creates an index of block-ids, headings, links referencing a block-id or heading, and embeds
 * Adds a button in Preview view with the count of references found
 * When button is clicked, reveals a table with links to each reference and line reference exists on
 */
export default class BlockRefCounter extends Plugin {
    private resolved: EventRef
    private typingIndicator: boolean

    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter");

        await this.loadSettings();

        this.addSettingTab(new BlockRefCountSettingTab(this.app, this));

        const typingDebounce = debounce(
            () => {
                this.typingIndicator = false;
            },
            1000,
            true
        );
        this.registerDomEvent(document, "keyup", () => {
            this.typingIndicator = true;
            typingDebounce();
        });

        const indexDebounce = debounce(
            () => indexBlockReferences(this.app),
            5000,
            true
        );
        const indexShortDebounce = debounce(
            () => indexBlockReferences(this.app),
            500,
            true
        );

        const previewDebounce = debounce(
            () => createPreviewView(this.app),
            500,
            true
        );

        /**
         * Fire the initial indexing only if layoutReady = true
         * and if the metadataCache has been resolved for the first time
         * avoids trying to create an index while obsidian is indexing files
         */
        if (!this.app.workspace.layoutReady) {
            this.resolved = this.app.metadataCache.on("resolved", () => {
                this.app.metadataCache.offref(this.resolved);
                indexBlockReferences(this.app);
                createPreviewView(this.app);
            });
        } else {
            indexBlockReferences(this.app);
            createPreviewView(this.app);
        }

        this.registerView("search-ref", (leaf: WorkspaceLeaf) => {
            if (!this.app.viewRegistry.getViewCreatorByType("search")) {
                return;
            }
            const newView: View =
                this.app.viewRegistry.getViewCreatorByType("search")(leaf);
            newView.getViewType = () => "search-ref";
            return newView;
        });

        /**
         * Event listeners to re-index notes if the cache changes or a note is deleted
         * triggers creation of block ref buttons on the preview view
         */
        this.registerEvent(
            this.app.metadataCache.on("changed", () => {
                previewDebounce();
                if (!this.typingIndicator) {
                    if (checkForChanges(this.app)) {
                        indexDebounce();
                    }
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", () => {
                if (!this.typingIndicator) {
                    if (checkForChanges(this.app)) {
                        indexShortDebounce();
                    }
                }
            })
        );

        /**
         * Event listeners for layout changes to update the preview view with a block ref count button
         */

        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                previewDebounce();
                if (!this.typingIndicator) {
                    if (checkForChanges(this.app)) {
                        indexShortDebounce();
                    }
                }
                const activeLeaf =
                    this.app.workspace.getActiveLeafOfViewType(MarkdownView);
                if (activeLeaf) {
                    try {
                        activeLeaf.previewMode?.renderer.onRendered(() => {
                            createPreviewView(this.app);
                        });
                    } catch (e) {
                        console.log(e);
                    }
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => {
                if (!this.typingIndicator) {
                    if (checkForChanges(this.app)) {
                        indexShortDebounce();
                    }
                }
                createPreviewView(this.app);
            })
        );

        this.registerEvent(
            this.app.workspace.on("file-open", () => {
                if (!this.typingIndicator) {
                    if (checkForChanges(this.app)) {
                        indexShortDebounce();
                    }
                }
                createPreviewView(this.app);
            })
        );

        this.registerMarkdownPostProcessor((el, ctx) => {
            const view = this.app.workspace.getActiveViewOfType(
                MarkdownView as unknown as Constructor<View>
            );
            if (view) {
                const path = view.file.path;
                const sectionInfo = ctx.getSectionInfo(el);
                const lineStart = sectionInfo && sectionInfo.lineStart;
                const page = getPage(path);
                if (page && lineStart) {
                    processPage(page, this.app, el, lineStart);
                }
            }
            if (checkForChanges(this.app)) {
                indexDebounce();
            }
        });

        //This runs only one time at beginning when Obsidian is completely loaded after startup

        this.app.workspace.onLayoutReady(() => {
            unloadSearchViews(this.app);
        });
    }

    onunload(): void {
        console.log("unloading plugin: Block Reference Counter");
        unloadButtons(this.app);
        unloadSearchViews(this.app);
    }
    async loadSettings(): Promise<void> {
        const newSettings = await this.loadData();
        updateSettings(newSettings);
    }
    async saveSettings(): Promise<void> {
        await this.saveData(getSettings());
    }
}

/**
 * Finds the sections present in a note's Preview, iterates them and adds references if required
 * This duplicates some of the functionality of onMarkdownPostProcessor, but is fired on layout and leaf changes
 * @param   {App}                   app
 * @return  {void}
 */

function createPreviewView(app: App): void {
    const view = app.workspace.getActiveViewOfType(
        MarkdownView as unknown as Constructor<View>
    );
    if (!view) {
        return;
    }
    const sourcePath = view.file?.path;
    // if previewMode exists and has sections, get the sections
    const elements = view.previewMode?.renderer?.sections;
    const page = getPage(sourcePath);
    if (page && elements) {
        elements.forEach((section: { el: HTMLElement; lineStart: number }) => {
            processPage(page, app, section.el, section.lineStart);
        });
    }
}

function processPage(
    page: {
        sections: Section[]
        blocks: Block[]
        headings: Heading[]
        items: EmbedOrLinkItem[]
    },
    app: App,
    el: HTMLElement,
    start: number
) {
    const settings = getSettings();
    if (page.sections) {
        page.sections.forEach((pageSection: Section) => {
            if (pageSection.position.start.line === start) {
                pageSection.pos = pageSection.position.start.line;
                const type = pageSection?.type;

                // find embeds because their section.type is paragraph but they need to be processed differently
                const embeds = el.querySelectorAll(".internal-embed");
                const hasEmbed = embeds.length > 0 ? true : false;
                if (
                    (settings.displayParent &&
                        page.blocks &&
                        !hasEmbed &&
                        type === "paragraph") ||
                    type === "list" ||
                    type === "blockquote" ||
                    type === "code"
                ) {
                    addBlockReferences(app, el, page.blocks, pageSection);
                }
                if (
                    settings.displayParent &&
                    page.headings &&
                    type === "heading"
                ) {
                    addHeaderReferences(app, el, page.headings, pageSection);
                }

                if (settings.displayChild && page.items) {
                    addLinkReferences(app, el, page.items, pageSection, embeds);
                }
            }
        });
    }
}

/**
 * Iterate through the blocks in the note and add a block ref button if the section includes a block-id
 *
 *
 * @param   {App}                      app
 * @param   {HTMLElement}              val      the HTMLElement to attach the button to
 * @param   {Block[]}                  blocks   Array of blocks from pages index
 * @param   {Section}                  section  Section object from pages index
 *
 * @return  {void}
 */
function addBlockReferences(
    app: App,
    val: HTMLElement,
    blocks: Block[],
    section: Section
): void {
    blocks &&
        blocks.forEach((block) => {
            if (block.key === section.id) {
                if (section.type === "paragraph") {
                    createButtonElement(app, block, val);
                }

                if (section.type === "blockquote" || section.type === "code") {
                    block.type = "link";
                    createButtonElement(app, block, val);
                }
            }

            // Iterate each list item and add the button to items with block-ids

            if (section.type === "list") {
                section.items.forEach((item, index: number) => {
                    const buttons = val.querySelectorAll("li");
                    if (item.id === block.key) {
                        createButtonElement(app, block, buttons[index]);
                    }
                });
            }
        });
}

/**
 * Iterate through links (includes transcluded embeds) and add a block ref button if the link has an associated block ref
 *
 * @param   {App}                     app
 * @param   {HTMLElement}             val        HTMLElement to attach the button to
 * @param   {EmbedOrLinkItem[]}       links      Array of links and embeds from pages index
 * @param   {Section}                 section    Section object from pages index
 * @param   {HTMLELement}             embedLink  if there is an embedLink it is passed in from createPreviewView
 *
 * @return  {void}
 */
function addLinkReferences(
    app: App,
    val: HTMLElement,
    links: EmbedOrLinkItem[],
    section: Section,
    embedLinks: NodeListOf<Element>
): void {
    links.forEach((link) => {
        if (section.type === "paragraph" && section.pos === link.pos) {
            embedLinks &&
                embedLinks.forEach((embedLink) => {
                    link.reference &&
                        embedLink &&
                        // need to delay a bit until the embed is loaded into the view
                        setTimeout(() => {
                            createButtonElement(
                                app,
                                link.reference,
                                embedLink.firstChild as HTMLElement
                            );
                        }, 1);
                });
            if (link.reference && !link.embed) {
                createButtonElement(app, link.reference, val);
            }
        }
        // Have to iterate list items so the button gets attached to the right element
        if (section.type === "list") {
            section.items.forEach((item, index: number) => {
                const buttons = val.querySelectorAll("li");
                embedLinks &&
                    embedLinks.forEach((embedLink) => {
                        if (
                            link.reference &&
                            embedLink &&
                            item.id === link.reference.key
                        ) {
                            setTimeout(() => {
                                createButtonElement(
                                    app,
                                    link.reference,
                                    embedLink.firstChild as HTMLElement
                                );
                            }, 1);
                        }
                    });
                if (link.reference && !link.embed && item.pos === link.pos) {
                    // change the type from link to block so createButtonElement adds the button to the right place

                    createButtonElement(app, link.reference, buttons[index]);
                }
            });
        }
    });
}

/**
 * Adds a block ref button to each header that has an associated header link or embed
 *
 * @param   {App}               app
 * @param   {HTMLElement}       val       HTMLElement to attach the button to
 * @param   {Heading[]}         headings  Array of heading objects from pages index
 * @param   {Section}           section   Section object from pages index
 *
 * @return  {void}
 */

function addHeaderReferences(
    app: App,
    val: HTMLElement,
    headings: Heading[],
    section: Section
): void {
    if (headings) {
        headings.forEach((header: Heading) => {
            header.pos === section.pos && createButtonElement(app, header, val);
        });
    }
}

/**
 * Add a button with the number of references to the Preview of a note
 *
 * @param   {App}               app
 * @param   {Block | Heading}   block  The block or Heading with references to generate the button for
 * @param   {HTMLElement}       val    The element to attach the button to
 *
 * @return  {void}
 */
function createButtonElement(
    app: App,
    block: Block | Heading,
    val: HTMLElement
): void {
    if (val) {
        const count = block && block.references ? block.references.size : 0;
        const normalizedKey = normalize(block.key);
        const existingButton = val.querySelector("#count");
        const countEl = createEl("button", { cls: "block-ref-count" });
        countEl.setAttribute("data-block-ref-id", block.key);
        countEl.setAttribute("id", "count");
        if (block.type === "link") {
            countEl.addClass("child-ref");
        } else {
            countEl.addClass("parent-ref");
        }
        countEl.innerText = count.toString();
        const { tableType } = getSettings();

        if (tableType === "basic") {
            const refs = block.references
                ? Array.from(block.references)
                : undefined;
            const refTable: HTMLElement = createTable(app, val, refs);
            countEl.on("click", "button", () => {
                if (!val.children.namedItem("ref-table")) {
                    block.type === "block" && val.appendChild(refTable);
                    block.type === "header" && val.appendChild(refTable);
                    block.type === "link" && val.append(refTable);
                } else {
                    if (val.children.namedItem("ref-table")) {
                        val.removeChild(refTable);
                    }
                }
            });
        }
        if (tableType === "search") {
            countEl.on("click", "button", async () => {
                const searchEnabled =
                    app.internalPlugins.getPluginById("global-search").enabled;
                if (!searchEnabled) {
                    new Notice("you need to enable the core search plugin");
                } else {
                    const tempLeaf = app.workspace.getRightLeaf(false);
                    //Hide the leaf/pane so it doesn't show up in the right sidebar
                    tempLeaf.tabHeaderEl.hide();
                    const blockKeyEsc = regexEscape(block.key);
                    const blockPageEsc = regexEscape(block.page);
                    const blockKeyClean = cleanHeader(block.key);
                    await tempLeaf.setViewState({
                        type: "search-ref",
                        state: {
                            query: `(file:("${blockPageEsc}.md") (/ \\^${blockKeyEsc}$/ OR /#\\^${blockKeyEsc}(\\]\\]|\\|.*\\]\\])/ OR /#+ ${blockKeyEsc}$/ OR /\\[\\[#${blockKeyClean}(\\]\\]|\\|.*\\]\\])/)) OR /\\[\\[${blockPageEsc}#\\^${blockKeyEsc}(\\]\\]|\\|.*\\]\\])/ OR /\\[\\[${blockPageEsc}#${blockKeyClean}(\\]\\]|\\|.*\\]\\])/`,
                        },
                    });
                    const search = app.workspace.getLeavesOfType("search-ref");
                    const searchElement = createSearchElement(
                        app,
                        search,
                        block
                    );
                    let searchHeight: number;
                    if (count === 1) {
                        searchHeight = 225;
                    } else if (count === 2) {
                        searchHeight = 250;
                    } else {
                        searchHeight = (count + 1) * 85;
                        if (searchHeight < 300) {
                            searchHeight = 300;
                        } else if (searchHeight > 600) {
                            searchHeight = 600;
                        }
                    }
                    searchElement.setAttribute(
                        "style",
                        "height: " + searchHeight + "px;"
                    );

                    if (!val.children.namedItem("search-ref")) {
                        search[search.length - 1].view.searchQuery;
                        // depending on the type of block the search view needs to be inserted into the DOM at different points
                        block.type === "block" && val.appendChild(searchElement);
                        block.type === "header" &&
                            val.appendChild(searchElement);
                        block.type === "link" && val.append(searchElement);
                    } else {
                        if (val.children.namedItem("search-ref")) {
                            app.workspace
                                .getLeavesOfType("search-ref")
                                .forEach((leaf) => {
                                    const container = leaf.view.containerEl;
                                    const dataKey = `[data-block-ref-id='${normalizedKey}']`;
                                    const key =
                                        container.parentElement.querySelector(
                                            dataKey
                                        );
                                    if (key) {
                                        leaf.detach();
                                    }
                                });
                        }
                    }
                }
            });
        }
        if (existingButton) {
            existingButton.remove();
        }
        count > 0 && val.prepend(countEl);
    }
}

function createSearchElement(app: App, search: WorkspaceLeaf[], block: Block) {
    const searchElement = search[search.length - 1].view.containerEl;
    const normalizedKey = normalize(block.key);
    searchElement.setAttribute("data-block-ref-id", normalizedKey);
    const toolbar = searchElement.querySelector(".nav-buttons-container");
    const closeButton = createEl("button", {
        cls: "search-input-clear-button",
    });
    closeButton.on("click", "button", () => {
        app.workspace.getLeavesOfType("search-ref").forEach((leaf) => {
            const container = leaf.view.containerEl;
            const dataKey = `[data-block-ref-id='${normalizedKey}']`;
            const key = container.parentElement.querySelector(dataKey);
            if (key) {
                leaf.detach();
            }
        });
    });
    toolbar.append(closeButton);
    searchElement.setAttribute("id", "search-ref");
    return searchElement;
}

function createTable(
    app: App,
    val: HTMLElement,
    refs: Reference[]
): HTMLElement {
    const refTable = createEl("table", { cls: "ref-table" });
    refTable.setAttribute("id", "ref-table");
    const noteHeaderRow = createEl("tr").createEl("th", { text: "Note" });

    const lineHeaderRow = createEl("tr").createEl("th", {
        text: "Reference",
        cls: "reference",
    });

    const removeTable = createEl("button", { text: "x" });
    removeTable.addClass("table-close");
    lineHeaderRow.appendChild(removeTable);
    removeTable.on("click", "button", () => {
        val.removeChild(refTable);
    });
    refTable.appendChild(noteHeaderRow);
    refTable.appendChild(lineHeaderRow);
    refTable.appendChild(removeTable);
    refs &&
        refs.forEach(async (ref) => {
            const file = (await app.vault.getAbstractFileByPath(
                ref.path
            )) as TFile;
            const lineContent = await app.vault
                .cachedRead(file)
                .then((content) => content.split("\n")[ref.pos]);
            const row = createEl("tr");
            const noteCell = createEl("td");
            const lineCell = createEl("td");
            noteCell.createEl("a", {
                cls: "internal-link",
                href: ref.path,
                text: ref.basename,
            });

            lineCell.createEl("span", { text: lineContent });
            row.appendChild(noteCell);
            row.appendChild(lineCell);
            refTable.appendChild(row);
        });
    return refTable;
}

/**
 * if there are block reference buttons in the current view, remove them
 * used when the plugin is unloaded
 *
 * @param   {App}  app
 *
 * @return  {void}
 */
function unloadButtons(app: App): void {
    let buttons;
    const activeLeaf = app.workspace.getActiveViewOfType(
        MarkdownView as unknown as Constructor<View>
    );
    if (activeLeaf) {
        buttons = activeLeaf.containerEl.querySelectorAll("#count");
    }
    buttons && buttons.forEach((button: HTMLElement) => button.remove());
}

function unloadSearchViews(app: App): void {
    app.workspace
        .getLeavesOfType("search-ref")
        .forEach((leaf: WorkspaceLeaf) => leaf.detach());
}

function regexEscape(regexString: string) {
    return regexString.replace(/(\[|\]|\^|\*|\||\(|\)|\.)/g, "\\$1");
}

//utility function to fetch a specific page from the index
function getPage(sourcePath: string) {
    const pages = getPages();
    return (
        pages[0] &&
        getPages().reduce((acc, page) => {
            if (page.file.path === sourcePath) {
                acc = page;
            }
            return acc;
        })
    );
}

//get the current active page and compare the cache to what is in the index
function checkForChanges(app: App) {
    const activeView = app.workspace.getActiveViewOfType(
        MarkdownView as unknown as Constructor<View>
    );
    if (activeView) {
        const activePage = getPage(activeView.file.path);
        if (activePage) {
            const currentCache = app.metadataCache.getFileCache(activeView.file);
            if (currentCache) {
                const { links, headings, blocks, embeds } = currentCache;
                if (
                    !isEqual(activePage.cache.links, links) ||
                    !isEqual(activePage.cache.headings, headings) ||
                    !isEqual(activePage.cache.blocks, blocks) ||
                    !isEqual(activePage.cache.embeds, embeds)
                ) {
                    return true;
                }
            }
        }
        return false;
    }
}

const normalize = (str: string) => {
    return str.replace(/\s+|'/g, "").toLowerCase();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isEqual = (a: any, b: any) => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.constructor !== b.constructor) return false;
    const keys = Object.keys(a);
    const length = keys.length;
    if (length !== Object.keys(b).length) return false;
    for (let i = 0; i < length; i++) {
        if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        if (a[keys[i]] === b[keys[i]] || isEqual(a[keys[i]], b[keys[i]]))
            return true;
    }
    return true;
};
