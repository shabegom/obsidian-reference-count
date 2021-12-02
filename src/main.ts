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
} from "obsidian";
import {
    Section,
    Link,
    TransformedCache,
    TransformedCachedItem,
} from "./types";
import { buildLinksAndReferences, getCurrentPage } from "./indexer";
import {
    BlockRefCountSettingTab,
    getSettings,
    updateSettings,
} from "./settings";

/*
 * BlockRefCounter Plugin
 * by shabegom
 *
 * Iterates through the cache of all notes in a vault and creates an index of block-ids, headings, links referencing a block-id or heading, and embeds
 * Adds a button in Preview view with the count of references found
 * When button is clicked, reveals a table with links to each reference and line reference exists on
 */
export default class BlockRefCounter extends Plugin {
    private resolved: EventRef;
    private page: TransformedCache;

    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter");
        await this.loadSettings();

        this.addSettingTab(new BlockRefCountSettingTab(this.app, this));

        const indexDebounce = debounce(
            () => {
                buildLinksAndReferences(this.app);
            },
            1000,
            true
        );
        const previewDebounce = debounce(
            () => {
                createPreviewView(this.app);
            },
            100,
            true
        );
        buildLinksAndReferences(this.app);
        createPreviewView(this.app);

        /**
         * Fire the initial indexing only if layoutReady = true
         * and if the metadataCache has been resolved for the first time
         * avoids trying to create an index while obsidian is indexing files
         */
        if (!this.app.workspace.layoutReady) {
            this.resolved = this.app.metadataCache.on("resolved", () => {
                this.app.metadataCache.offref(this.resolved);
                buildLinksAndReferences(this.app);
                createPreviewView(this.app);
            });
        } else {
            buildLinksAndReferences(this.app);
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

        //        *
        // Event listeners to re-index notes if the cache changes or a note is deleted
        // triggers creation of block ref buttons on the preview view

        this.registerEvent(
            this.app.vault.on("delete", () => {
                indexDebounce();
            })
        );

        //       *
        // Event listeners for layout changes to update the preview view with a block ref count button
        //
        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                indexDebounce();
                previewDebounce();
            })
        );

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => {
                indexDebounce();
                previewDebounce();
            })
        );

        this.registerEvent(
            this.app.workspace.on("file-open", (file): void => {
                indexDebounce();
                this.page = getCurrentPage({ file, app: this.app });
                previewDebounce();
            })
        );

        this.registerEvent(
            this.app.metadataCache.on("resolve", (file) => {
                indexDebounce();
                this.page = getCurrentPage({ file, app: this.app });
                previewDebounce();
            })
        );

        this.registerMarkdownPostProcessor((el, ctx) => {
            const sectionInfo = ctx.getSectionInfo(el);
            const lineStart = sectionInfo && sectionInfo.lineStart;
            if (this.page && lineStart) {
                processPage(this.page, this.app, el, lineStart);
            }
        });
        //
        //        This runs only one time at beginning when Obsidian is completely loaded after startup
        //
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
    const activeView = app.workspace.getActiveViewOfType(
        MarkdownView as unknown as Constructor<View>
    );
    if (activeView) {
        const page = getCurrentPage({ file: activeView.file, app });
        try {
            activeView.previewMode?.renderer.onRendered(() => {
                // if previewMode exists and has sections, get the sections
                const elements = activeView.previewMode?.renderer?.sections;
                if (page && elements) {
                    elements.forEach(
                        (section: { el: HTMLElement; lineStart: number }) => {
                            processPage(
                                page,
                                app,
                                section.el,
                                section.lineStart
                            );
                        }
                    );
                }
            });
        } catch (e) {
            console.log(e);
        }
    }
}

function processPage(
    page: TransformedCache,
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

                if (settings.displayChild && page.links) {
                    addLinkReferences(app, el, page.links, pageSection);
                }
                if (settings.displayChild && page.embeds) {
                    addEmbedReferences(app, el, page.embeds, pageSection);
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
    blocks: TransformedCache["blocks"],
    section: Section
): void {
    blocks &&
        blocks.forEach((block) => {
            if (block.key === section.id) {
                if (section.type === "paragraph") {
                    createButtonElement(app, block, val);
                }

                if (section.type === "blockquote" || section.type === "code") {
                    createButtonElement(app, block, val);
                }
            }

            // Iterate each list item and add the button to items with block-ids

            if (section.type === "list") {
                section.items.forEach((item, index: number) => {
                    const buttons = val.querySelectorAll("li");
                    block.type = "block-list";
                    if (item.id === block.key) {
                        createButtonElement(app, block, buttons[index]);
                    }
                });
            }
        });
}

function addEmbedReferences(
    app: App,
    val: HTMLElement,
    embeds: TransformedCache["embeds"],
    section: Section
): void {
    embeds.forEach((embed) => {
        if (section.pos === embed.pos) {
            if (section.type === "paragraph") {
                setTimeout(() => {
                    createButtonElement(app, embed, val);
                }, 500);
            }

            if (section.type === "blockquote" || section.type === "code") {
                setTimeout(() => {
                    createButtonElement(app, embed, val);
                }, 500);
            }
        }

        // Iterate each list item and add the button to items with block-ids

        if (section.type === "list") {
            section.items.forEach((item, index: number) => {
                const buttons = val.querySelectorAll("li");
                if (item.pos === embed.pos) {
                    embed.type = "link-list";
                    createButtonElement(app, embed, buttons[index]);
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
 *
 * @return  {void}
 */
function addLinkReferences(
    app: App,
    val: HTMLElement,
    links: TransformedCachedItem[],
    section: Section
): void {
    links.forEach((link) => {
        if (section.type === "paragraph" && section.pos === link.pos) {
            createButtonElement(app, link, val);
        }
        // Have to iterate list items so the button gets attached to the right element
        if (section.type === "list") {
            section.items.forEach((item, index: number) => {
                const buttons = val.querySelectorAll("li");
                if (item.pos === link.pos) {
                    link.type = "link-list";
                    createButtonElement(app, link, buttons[index]);
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
    headings: TransformedCachedItem[],
    section: Section
): void {
    if (headings) {
        headings.forEach((header: TransformedCachedItem) => {
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
    block: TransformedCachedItem,
    val: HTMLElement
): void {
    if (val) {
        const count = block && block.references ? block.references.length : 0;
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
            const refs = block.references ? block.references : undefined;
            const refTable: HTMLElement = createTable(app, val, refs);
            countEl.on("click", "button", () => {
                if (!val.children.namedItem("ref-table")) {
                    block.type === "block" && val.appendChild(refTable);
                    block.type === "header" && val.appendChild(refTable);
                    block.type === "link" && val.append(refTable);
                    block.type.includes("list") &&
                        val.insertBefore(refTable, val.children[2]);
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
                    let page;
                    let firstReference;
                    let secondReference;

                    if (block.type === "link" || block.type === "link-list") {
                        page = block.key;
                        if (
                            block.key.includes("#") &&
                            !block.key.includes("#^")
                        ) {
                            page = block.key.split("#")[0];
                            if (block.original) {
                                firstReference = `/^#{1,6} ${regexEscape(
                                    block.original
                                )}$/`;
                            } else {
                                firstReference = `/^#{1,6} ${regexEscape(
                                    block.key.split("#")[1]
                                )}$/`;
                            }
                        }
                        if (block.key.includes("#^")) {
                            page = block.key.split("#^")[0];
                            firstReference = `^${block.key.split("#^")[1]}`;
                            if (block.key.includes("|")) {
                                firstReference = `${
                                    firstReference.split("|")[0]
                                }"`;
                            }
                        }
                        if (!firstReference) {
                            firstReference = "";
                        }
                        secondReference = `"[[${block.key}]]"`;
                        if (block.key.includes("|")) {
                            secondReference =
                                secondReference +
                                ` OR "[[${block.key.split("|")[0]}]]"`;
                        } else {
                            secondReference =
                                secondReference + ` OR "[[${block.key}|"`;
                        }
                    }
                    if (block.type === "header") {
                        page = block.page;
                        firstReference = `/^#{1,6} ${regexEscape(
                            block.original
                        )}$/`;
                        secondReference = `/#${block.key}]]/`;
                    }
                    if (block.type === "block" || block.type === "block-list") {
                        page = block.page;
                        firstReference = `"^${block.key}"`;
                        secondReference = firstReference;
                    }
                    const searchQuery = `(file:("${page}.md") ${firstReference}) OR (${secondReference}) `;
                    await tempLeaf.setViewState({
                        type: "search-ref",
                        state: {
                            query: searchQuery,
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
                        block.type === "block" &&
                            val.appendChild(searchElement);
                        block.type === "header" &&
                            val.appendChild(searchElement);
                        block.type === "link" && val.append(searchElement);
                        block.type.includes("list")&&
                            val.insertBefore(searchElement, val.children[2]);
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

function createSearchElement(
    app: App,
    search: WorkspaceLeaf[],
    block: TransformedCachedItem
) {
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

function createTable(app: App, val: HTMLElement, refs: Link[]): HTMLElement {
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
            const lineContent = await app.vault
                .cachedRead(ref.sourceFile)
                .then(
                    (content) =>
                        content.split("\n")[ref.reference.position.start.line]
                );
            const row = createEl("tr");
            const noteCell = createEl("td");
            const lineCell = createEl("td");
            noteCell.createEl("a", {
                cls: "internal-link",
                href: ref.sourceFile.path,
                text: ref.sourceFile.basename,
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

function regexEscape(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const normalize = (str: string) => {
    return str.replace(/\s+|'/g, "").toLowerCase();
};
