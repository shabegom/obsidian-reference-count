import {
    App,
    EventRef,
    Plugin,
    WorkspaceLeaf,
    View,
    Events,
    MarkdownView,
    TFile,
    Notice,
} from "obsidian"
import { Block, Section, Heading, EmbedOrLinkItem } from "./types"
import { indexBlockReferences, getPages, cleanHeader } from "./indexer"
import {
    BlockRefCountSettings,
    BlockRefCountSettingTab,
    getSettings,
    updateSettings,
} from "./settings"



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
    private indexer = new Events()
    private indexStatus: string
    private typingIndicator: boolean


    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter")

        await this.loadSettings()

        unloadSearchViews(this.app)

        this.addSettingTab(new BlockRefCountSettingTab(this.app, this))
        /**
         * Setting the indexStatus so we don't overindex
         */
        this.registerEvent(
            this.indexer.on("index-in-progress", () => {
                this.indexStatus = "in-progress"
            })
        )

        // three second debounce so we don't index repeatedly on meta changes
        const completionDebounce = debounce(() => {
            this.indexStatus = "complete"
        }, 3000)
        this.registerEvent(
            this.indexer.on("index-complete", () => {
                completionDebounce()
            })
        )

        const typingDebounce = debounce(() => {
            this.typingIndicator = false
        }, 1000)
        this.registerDomEvent(document, "keyup", () => {
            this.typingIndicator = true
            typingDebounce()
        })

        const indexDebounce = debounce(() => indexBlockReferences(this.app, this.indexer), 10000)
        const previewDebounce = debounce(() => createPreviewView(this.app), 1000, true)


        /**
         * Fire the initial indexing only if layoutReady = true
         * and if the metadataCache has been resolved for the first time
         * avoids trying to create an index while obsidian is indexing files
         */
        if (!this.app.workspace.layoutReady) {
            this.resolved = this.app.metadataCache.on("resolved", () => {
                indexBlockReferences(this.app, this.indexer)
                previewDebounce()
                this.app.metadataCache.offref(this.resolved)
            })
        } else {
            indexBlockReferences(this.app, this.indexer)
            previewDebounce()
        }

        this.registerView("search-ref", (leaf: WorkspaceLeaf) => {
            if (!this.app.viewRegistry.getViewCreatorByType("search")) {
                return
            }
            const newView: View =
                this.app.viewRegistry.getViewCreatorByType("search")(leaf)
            newView.getViewType = () => "search-ref"
            return newView
        })

        /**
         * Event listeners to re-index notes if the cache changes or a note is deleted
         * triggers creation of block ref buttons on the preview view
         */
        this.registerEvent(
            this.app.metadataCache.on("resolved", () => {
                if (this.indexStatus === "complete" && !this.typingIndicator) {
                    indexDebounce()
                }
                previewDebounce()
            })
        )

        this.registerEvent(
            this.app.vault.on("delete", () => {
                if (this.indexStatus === "complete" && !this.typingIndicator) {
                    indexDebounce()
                }
            })
        )

        /**
         * Event listeners for layout changes to update the preview view with a block ref count button
         */

        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                previewDebounce()
                if (this.indexStatus === "complete" && !this.typingIndicator) {
                    indexDebounce()
                }
            })
        )

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", () => {
                previewDebounce()
                if (this.indexStatus === "complete" && !this.typingIndicator) {
                    indexDebounce()
                }
            })
        )

        this.registerEvent(
            this.app.workspace.on("file-open", () => {
                previewDebounce()
                if (this.indexStatus === "complete" && !this.typingIndicator) {
                    indexDebounce()
                }

            })
        )

        this.registerMarkdownPostProcessor((el, ctx) => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView)
            const path = view.file.path
            const start = ctx.getSectionInfo(el).lineStart
            const page = getPage(path)
            if (page) {
                processPage(page, this.app, el, start)
            }
            previewDebounce()
        })

        //This runs only one time at beginning when Obsidian is completely loaded after startup
        this.registerEvent(
            this.app.workspace.on("layout-ready", () => {
                unloadSearchViews(this.app)
            })
        )
    }

    onunload(): void {
        console.log("unloading plugin: Block Reference Counter")
        unloadButtons(this.app)
        unloadSearchViews(this.app)
    }
    async loadSettings() {
        const newSettings = await this.loadData()
        updateSettings(newSettings)
    }
    async saveSettings() {
        await this.saveData(getSettings())
    }
}

/**
 * Finds the sections present in a note's Preview, iterates them and adds references if required
 * This duplicates some of the functionality of onMarkdownPostProcessor, but is fired on layout and leaf changes
 * @param   {App}                   app
 * @return  {void}
 */
function createPreviewView(
    app: App,
): void {
    let view
    const activeLeaf = app.workspace.getActiveViewOfType(MarkdownView)
    if (activeLeaf) {
        view = activeLeaf.view
    } else {
        view = null
    }
    if (!view) {
        return
    }
    const sourcePath = view.file?.path
    // if previewMode exists and has sections, get the sections
    const elements = view.previewMode?.renderer?.sections
    const page = getPage(sourcePath)
    if (page && elements) {
        elements.forEach(
            (section: { el: HTMLElement; lineStart: number }) => {
                processPage(page, app, section.el, section.lineStart)
            }
        )
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
    const settings = getSettings()
    if (page.sections) {
        page.sections.forEach((pageSection: Section) => {
            if (pageSection.position.start.line === start) {
                pageSection.pos = pageSection.position.start.line
                const type = pageSection?.type

                // find embeds because their section.type is paragraph but they need to be processed differently
                const embeds = el.querySelectorAll(".internal-embed")
                const hasEmbed = embeds.length > 0 ? true : false
                if (
                    (settings.displayParent &&
                    page.blocks &&
                    !hasEmbed &&
                    type === "paragraph") ||
                type === "list" ||
                type === "blockquote" ||
                type === "code"
                ) {
                    addBlockReferences(app, el, page.blocks, pageSection)
                }
                if (settings.displayParent && page.headings && type === "heading") {
                    addHeaderReferences(app, el, page.headings, pageSection)
                }

                if (settings.displayChild && page.items) {
                    addLinkReferences(
                        app,
                        el,
                        page.items,
                        pageSection,
                        embeds
                    )
                }
            }
        })
    }
}

/**
 * Iterate through the blocks in the note and add a block ref button if the section includes a block-id
 *
 *
 * @param   {App}                      app
 * @param   {HTMLElement}              val      the HTMLElement to attach the button to
 * @param   {Block[]}                  blocks   Array of blocks from pages index
 * @param   {Section}                  section  Section object from pages indext
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
                    createButtonElement(app, block, val)
                }

                if (section.type === "blockquote" || section.type === "code") {
                    block.type = "link"
                    createButtonElement(app, block, val)
                }
            }

            // Iterate each list item and add the button to items with block-ids

            if (section.type === "list") {
                section.items.forEach((item, index: number) => {
                    const buttons = val.querySelectorAll("li")
                    if (item.id === block.key) {
                        createButtonElement(app, block, buttons[index])
                    }
                })
            }
        })
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
                            createButtonElement(app, link.reference, embedLink.firstChild as HTMLElement)
                        }, 10)
                })
            if (link.reference && !link.embed) {
                createButtonElement(app, link.reference, val)
            }
        }
        // Have to iterate list items so the button gets attached to the right element
        if (section.type === "list") {
            section.items.forEach((item, index: number) => {
                const buttons = val.querySelectorAll("li")
                embedLinks &&
                    embedLinks.forEach((embedLink) => {
                        if (
                            link.reference &&
                            embedLink &&
                            item.id === link.reference.key
                        ) {
                            setTimeout(() => {
                                createButtonElement(app, link.reference, embedLink.firstChild as HTMLElement)
                            }, 10)
                        }
                    })
                if (link.reference && !link.embed && item.pos === link.pos) {
                    // change the type from link to block so createButtonElement adds the button to the right place

                    link.reference.type = "block"
                    createButtonElement(app, link.reference, buttons[index])
                }
            })
        }
    })
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
            header.pos === section.pos && createButtonElement(app, header, val)
        })
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
    app:  App,
    block: Block | Heading,
    val: HTMLElement
): void {
    if (val) {
        const count = block && block.references ? block.references.size : 0
        const existingButton = val.querySelector("#count")
        const countEl = createEl("button", { cls: "block-ref-count" })
        countEl.setAttribute("data-block-ref-id", block.key)
        countEl.setAttribute("id", "count")
        countEl.innerText = count.toString()
        const {tableType} = getSettings()

        countEl.on("click", "button", async () => {
            const searchEnabled = app.internalPlugins.getPluginById("global-search").enabled
            if (!searchEnabled) {new Notice("you need to enable the core search plugin")}
            if (tableType === "search" && searchEnabled) {
                const tempLeaf = app.workspace.getRightLeaf(false)
                //Hide the leaf/pane so it doesn't show up in the right sidebar
                tempLeaf.tabHeaderEl.hide()
                const blockKeyEsc = regexEscape(block.key)
                const blockPageEsc = regexEscape(block.page)
                const blockKeyClean = cleanHeader(block.key)
                await tempLeaf.setViewState({
                    type: "search-ref",
                    state: {
                        query: `(file:("${blockPageEsc}.md") (/ \\^${blockKeyEsc}$/ OR /#\\^${blockKeyEsc}(\\]\\]|\\|.*\\]\\])/ OR /#+ ${blockKeyEsc}$/ OR /\\[\\[#${blockKeyClean}(\\]\\]|\\|.*\\]\\])/)) OR /\\[\\[${blockPageEsc}#\\^${blockKeyEsc}(\\]\\]|\\|.*\\]\\])/ OR /\\[\\[${blockPageEsc}#${blockKeyClean}(\\]\\]|\\|.*\\]\\])/`,
                    },
                })
                const search = app.workspace.getLeavesOfType("search-ref")
                const searchElement = createSearchElement(app, search, block)
                let searchHeight: number
                if (count === 1) {
                    searchHeight = 225
                } else if (count === 2) {
                    searchHeight = 250
                } else {
                    searchHeight = (count + 1) * 85
                    if (searchHeight < 300) {
                        searchHeight = 300
                    } else if (searchHeight > 600) {
                        searchHeight = 600
                    }
                }
                searchElement.setAttribute(
                    "style",
                    "height: " + searchHeight + "px;"
                )

                if (!val.children.namedItem("search-ref")) {
                    search[search.length - 1].view.searchQuery
                    // depending on the type of block the search view needs to be inserted into the DOM at different points
                    block.type === "block" &&
                    val.appendChild(searchElement)
                    block.type === "header" && val.appendChild(searchElement)
                    block.type === "link" && val.append(searchElement)
                } else {
                    if (val.children.namedItem("search-ref")) {
                        app.workspace
                            .getLeavesOfType("search-ref")
                            .forEach((leaf) => {
                                const container = leaf.view.containerEl
                                const dataKey = `[data-block-ref-id='${block.key}']`
                                const key =
                                container.parentElement.querySelector(dataKey)
                                if (key) {
                                    leaf.detach()
                                }
                            })
                    }
                }
            }
        })
        if (existingButton) {
            existingButton.remove()
        }
        count > 0 && val.prepend(countEl)
    }
}

function createSearchElement(app: App, search: any, block: Block) {
    const searchElement = search[search.length - 1].view.containerEl
    searchElement.setAttribute("data-block-ref-id", block.key)
    const toolbar = searchElement.querySelector(".nav-buttons-container")
    const closeButton = createEl("button", {
        cls: "search-input-clear-button",
    })
    closeButton.on("click", "button", () => {
        app.workspace.getLeavesOfType("search-ref").forEach((leaf) => {
            const container = leaf.view.containerEl
            const dataKey = `[data-block-ref-id='${block.key}']`
            const key = container.parentElement.querySelector(dataKey)
            if (key) {
                leaf.detach()
            }
        })
    })
    toolbar.append(closeButton)
    searchElement.setAttribute("id", "search-ref")
    return searchElement
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
    let buttons
    const activeLeaf = app.workspace.getActiveViewOfType(MarkdownView)
    if (activeLeaf) {
        buttons = activeLeaf.containerEl.querySelectorAll("#count")
    }
    buttons && buttons.forEach((button: HTMLElement) => button.remove())
}

function unloadSearchViews(app: App): void {
    app.workspace
        .getLeavesOfType("search-ref")
        .forEach((leaf: WorkspaceLeaf) => leaf.detach())
}

function regexEscape(regexString: string) {
    return regexString.replace(/(\[|\]|\^|\*|\||\(|\)|\.)/g, "\\$1")
}

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
// from: https://davidwalsh.name/javascript-debounce-function
function debounce(func: () => void, wait: number, immediate?: boolean) {
    let timeout: ReturnType<typeof setTimeout>
    return function (...args: any) {
        const later = function () {
            timeout = null
            if (!immediate) func.apply(this, ...args)
        }
        const callNow = immediate && !timeout
        clearTimeout(timeout)
        timeout = setTimeout(later, wait)
        if (callNow) func.apply(this, ...args)
    }
}

//utility function to fetch a specific page from the index
function getPage(sourcePath: string) {
    const pages = getPages()

    return pages[0] &&
        getPages().reduce((acc, page) => {
            if (page.file.path === sourcePath) {
                acc = page
            }
            return acc
        })

}