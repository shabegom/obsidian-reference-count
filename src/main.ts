import { App, EventRef, Plugin, WorkspaceLeaf, View, Events, SearchComponent } from "obsidian"
import {
    Block,
    Section,
    Heading,
    EmbedOrLinkItem
} from "./types"
import { indexBlockReferences, getPages, cleanHeader } from "./indexer"
import { BlockRefCountSettingTab, BlockRefCountSettings, DEFAULT_SETTINGS } from "./settings"


/**
 * BlockRefCounter Plugin
 * by shabegom and Murf
 *
 * Iterates through the cache of all notes in a vault and creates an index of block-ids, headings, links referencing a block-id or heading, and embeds
 * Adds a button in Preview view with the count of references found
 * When button is clicked, reveals a table with links to each reference and line reference exists on
 */
export default class BlockRefCounter extends Plugin {
    settings: BlockRefCountSettings;

    private metaResolvedChange: EventRef
    private layoutReady: EventRef
    private layoutChange: EventRef
    private activeLeafChange: EventRef
    private cacheUpdateChange: EventRef
    private deleteFile: EventRef
    private resolved: EventRef
    private layoutLoaded: EventRef
    private indexer = new Events
    private indexInProgress: EventRef
    private indexComplete: EventRef
    private indexStatus: string

    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter")
        await this.loadSettings()
        unloadSearchViews(this.app)

        this.addSettingTab(new BlockRefCountSettingTab(this.app, this))
        /**
         * Setting the indexStatus so we don't overindex
         */
        this.indexInProgress = this.indexer.on("index-in-progress", () => {
            this.indexStatus = "in-progress"
        })
        // one minute debounce so we don't index repeatedly on meta changes
        this.indexComplete = this.indexer.on("index-complete", () => {
            setTimeout(() => {
                this.indexStatus = "complete"
            }, 3000)
        })

        /**
         * Fire the initial indexing only if layoutReady = true
         * and if the metadataCache has been resolved for the first time
         * avoids trying to create an index while obsidian is indexing files
         */
        if (!this.app.workspace.layoutReady) {
            this.resolved = this.app.metadataCache.on("resolved", () => {
                indexBlockReferences(this.app, this.indexer)
                createPreviewView(this.app)
                this.app.metadataCache.offref(this.resolved)
            })
        } else {
            indexBlockReferences(this.app, this.indexer)
            createPreviewView(this.app)
        }

        this.registerView("search-ref", (leaf: WorkspaceLeaf) => {
            const newView: View =
                this.app.viewRegistry.getViewCreatorByType("search")(leaf)
            newView.getViewType = () => "search-ref"
            return newView
        })

        /**
         * Event listeners to re-index notes if the cache changes or a note is deleted
         * triggers creation of block ref buttons on the preview view
         */
        this.metaResolvedChange = this.app.metadataCache.on("resolved", () => {
            if (this.indexStatus === "complete") {
                indexBlockReferences(this.app, this.indexer)
                createPreviewView(this.app)
            }
        })

        this.deleteFile = this.app.vault.on("delete", () => {
            if (this.indexStatus === "complete") {
                indexBlockReferences(this.app, this.indexer)
            }
            createPreviewView(this.app)
        })

        /**
         * Event listeners for layout changes to update the preview view with a block ref count button
         */

        this.layoutChange = this.app.workspace.on("layout-change", () => {
            this.app.workspace.activeLeaf.view.previewMode?.renderer.onRendered(
                () => {
                    createPreviewView(this.app)
                }
            )
        })

        this.activeLeafChange = this.app.workspace.on(
            "active-leaf-change",
            (leaf) => {
                createPreviewView(this.app, leaf)
            }
        )

        //This runs only one time at beginning when Obsidian is completely loaded after startup
        this.layoutLoaded = this.app.workspace.on("layout-ready", () => {
            unloadSearchViews(this.app)
        })
    }

    onunload(): void {
        console.log("unloading plugin: Block Reference Counter")
        this.app.metadataCache.offref(this.metaResolvedChange)
        this.app.workspace.offref(this.layoutReady)
        this.app.workspace.offref(this.layoutChange)
        this.app.workspace.offref(this.layoutLoaded)
        this.app.workspace.offref(this.activeLeafChange)
        this.app.workspace.offref(this.cacheUpdateChange)
        this.app.workspace.offref(this.deleteFile)
        this.indexer.offref(this.indexInProgress)
        this.indexer.offref(this.indexComplete)
        unloadButtons(this.app)
        unloadSearchViews(this.app)
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    }
    async saveSettings() {
        await this.saveData(this.settings)
    }

}

/**
 * Finds the sections present in a note's Preview, iterates them and adds references if required
 * This duplicates some of the functionality of onMarkdownPostProcessor, but is fired on layout and leaf changes
 *
 * @param   {WorkspaceLeaf}         leaf  if leaf is passed, use that to get the view
 * @param   {App}                   app
 * @return  {void}
 */
function createPreviewView(app: App, leaf?: WorkspaceLeaf): void {
    const view = leaf ? leaf.view : app.workspace.activeLeaf ? app.workspace.activeLeaf.view : null
    if (!view) { return }
    const sourcePath = view.file?.path
    // if previewMode exists and has sections, get the sections
    const elements = view.previewMode?.renderer?.sections
    const pages = getPages()
    const page =
        pages[0] &&
        getPages().reduce((acc, page) => {
            if (page.file.path === sourcePath) {
                acc = page
            }
            return acc
        })

    if (page) {
        elements &&
            elements.forEach((section, index) => {
                const pageSection = page.sections[index]
                if (pageSection) {
                    pageSection.pos = pageSection.position.start.line
                    const type = pageSection?.type
                    // find embeds because their section.type is paragraph but they need to be processed differently
                    const embedLinks =
                        section.el.querySelectorAll(".markdown-embed")
                    const hasEmbed = embedLinks.length > 0 ? true : false
                    if (
                        (page.blocks && !hasEmbed && type === "paragraph") ||
                        type === "list" ||
                        type === "blockquote" ||
                        type === "code"
                    ) {
                        addBlockReferences(
                            app,
                            section.el,
                            page.blocks,
                            pageSection,
                        )
                    }
                    if (page.headings && type === "heading") {
                        addHeaderReferences(
                            app,
                            section.el,
                            page.headings,
                            pageSection,
                        )
                    }

                    if (page.items) {
                        addLinkReferences(
                            app,
                            section.el,
                            page.items,
                            pageSection,
                            embedLinks as NodeListOf<HTMLElement>,
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
    section: Section): void {
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
                        createButtonElement(
                            app,
                            block,
                            buttons[index],
                        )
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
    embedLinks: NodeListOf<HTMLElement>,
): void {
    links.forEach((link) => {
        if (section.type === "paragraph" && section.pos === link.pos) {
            embedLinks &&
                embedLinks.forEach((embedLink) => {
                    link.reference &&
                        embedLink &&
                        createButtonElement(
                            app,
                            link.reference,
                            embedLink,
                        )
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
                            createButtonElement(
                                app,
                                link.reference,
                                embedLink,
                            )
                        }
                    })
                if (link.reference && !link.embed && item.pos === link.pos) {
                    // change the type from link to block so createButtonElement adds the button to the right place

                    link.reference.type = "block"
                    createButtonElement(
                        app,
                        link.reference,
                        buttons[index],
                    )
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
    section: Section,): void {
    if (headings) {
        headings.forEach((header: Heading) => {
            header.pos === section.pos &&
                createButtonElement(app, header, val)
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
function createButtonElement(app: App, block: Block | Heading, val: HTMLElement): void {
    const count = block && block.references ? block.references.size : 0

    const existingButton = val.querySelector("#count")
    const countEl = createEl("button", { cls: "block-ref-count" })
    countEl.setAttribute("data-block-ref-id", block.key)
    countEl.setAttribute("id", "count")
    countEl.innerText = count.toString()

    countEl.on("click", "button", async () => {
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
        if (count === 1) { searchHeight = 225 } else if (count === 2) { searchHeight = 250 } else {
            searchHeight = (count + 1) * 85
            if (searchHeight < 300) { searchHeight = 300 } else if (searchHeight > 600) { searchHeight = 600 }
        }
        searchElement.setAttribute("style", "height: " + searchHeight + "px;")

        if (!val.children.namedItem("search-ref")) {
            search[search.length - 1].view.searchQuery
            // depending on the type of block the search view needs to be inserted into the DOM at different points
            block.type === "block" &&
                val.insertBefore(searchElement, val.lastChild)
            block.type === "header" && val.appendChild(searchElement)
            block.type === "link" && val.append(searchElement)
        } else {
            if (val.children.namedItem("search-ref")) {
                app.workspace.getLeavesOfType("search-ref").forEach((leaf) => {
                    const container = leaf.view.containerEl
                    const dataKey = `[data-block-ref-id='${block.key}']`
                    const key = container.parentElement.querySelector(dataKey)
                    if (key) {
                        leaf.detach()
                    }
                })
            }
        }
    })
    if (existingButton) {
        existingButton.remove()
    }
    count > 0 && val.prepend(countEl)
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
    const buttons =
        app.workspace.activeLeaf.containerEl.querySelectorAll("#count")
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
