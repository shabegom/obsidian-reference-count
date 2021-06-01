import { App, EventRef, Plugin, WorkspaceLeaf, View } from "obsidian"
import {
    AddBlockReferences,
    CreateButtonElement,
    AddHeaderReferences,
    Heading,
    AddLinkReferences,
} from "./types"
import { indexBlockReferences, getPages } from "./indexer"
import { defaultCipherList } from "constants"

/**
 * BlockRefCounter Plugin
 * by shabegom and Murf
 *
 * Iterates through the cache of all notes in a vault and creates an index of block-ids, headings, links referencing a block-id or heading, and embeds
 * Adds a button in Preview view with the count of references found
 * When button is clicked, reveals a table with links to each reference and line reference exists on
 */
export default class BlockRefCounter extends Plugin {
    private cacheUpdate: EventRef
    private layoutReady: EventRef
    private layoutChange: EventRef
    private activeLeafChange: EventRef
    private deleteFile: EventRef
    private resolved: EventRef

    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter")

        /**
         * Fire the initial indexing only if layoutReady = true
         * and if the metadataCache has been resolved for the first time
         * avoids trying to create an index while obsidian is indexing files
         */
        if (!this.app.workspace.layoutReady) {
            this.resolved = this.app.metadataCache.on("resolved", () => {
                indexBlockReferences({ app: this.app })
                createPreviewView({ app: this.app })
                this.app.metadataCache.offref(this.resolved)
            })
        } else {
            indexBlockReferences({ app: this.app })
            createPreviewView({ app: this.app })
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
        this.cacheUpdate = this.app.metadataCache.on("changed", () => {
            indexBlockReferences({ app: this.app })
            createPreviewView({ app: this.app })
        })

        this.deleteFile = this.app.vault.on("delete", () => {
            indexBlockReferences({ app: this.app })
            createPreviewView({ app: this.app })
        })

        this.layoutChange = this.app.workspace.on("layout-change", () => {
            this.app.workspace.activeLeaf.view.previewMode?.renderer.onRendered(
                () => {
                    createPreviewView({ app: this.app })
                }
            )
        })

        this.activeLeafChange = this.app.workspace.on(
            "active-leaf-change",
            (leaf) => {
                createPreviewView({ leaf, app: this.app })
            }
        )
    }

    onunload(): void {
        console.log("unloading plugin: Block Reference Counter")
        this.app.metadataCache.offref(this.cacheUpdate)
        this.app.workspace.offref(this.layoutReady)
        this.app.workspace.offref(this.layoutChange)
        this.app.workspace.offref(this.activeLeafChange)
        this.app.workspace.offref(this.deleteFile)
        unloadButtons(this.app)
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
function createPreviewView({ leaf, app }: { leaf?: WorkspaceLeaf; app: App }) {
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
                        addBlockReferences({
                            app,
                            val: section.el,
                            blocks: page.blocks,
                            section: pageSection,
                        })
                    }
                    if (page.headings && type === "heading") {
                        addHeaderReferences({
                            app,
                            val: section.el,
                            headings: page.headings,
                            section: pageSection,
                        })
                    }

                    if (page.items) {
                        addLinkReferences({
                            app,
                            val: section.el,
                            links: page.items,
                            section: pageSection,
                            embedLinks,
                        })
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
function addBlockReferences({
    app,
    val,
    blocks,
    section,
}: AddBlockReferences): void {
    blocks &&
        blocks.forEach((block) => {
            if (block.key === section.id) {
                if (section.type === "paragraph") {
                    createButtonElement({ app, block, val })
                }

                if (section.type === "blockquote" || section.type === "code") {
                    block.type = "link"
                    createButtonElement({ app, block, val })
                }
            }

            // Iterate each list item and add the button to items with block-ids

            if (section.type === "list") {
                section.items.forEach((item, index: number) => {
                    const buttons = val.querySelectorAll("li")
                    if (item.id === block.key) {
                        createButtonElement({
                            app,
                            block,
                            val: buttons[index],
                        })
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
function addLinkReferences({
    app,
    val,
    links,
    section,
    embedLinks,
}: AddLinkReferences) {
    links.forEach((link) => {
        if (section.type === "paragraph" && section.pos === link.pos) {
            embedLinks &&
                embedLinks.forEach((embedLink) => {
                    link.reference &&
                        embedLink &&
                        createButtonElement({
                            app,
                            block: link.reference,
                            val: embedLink,
                        })
                })
            if (link.reference && !link.embed) {
                createButtonElement({ app, block: link.reference, val })
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
                            createButtonElement({
                                app,
                                block: link.reference,
                                val: embedLink,
                            })
                        }
                    })
                if (link.reference && !link.embed && item.pos === link.pos) {
                    // change the type from link to block so createButtonElement adds the button to the right place

                    link.reference.type = "block"
                    createButtonElement({
                        app,
                        block: link.reference,
                        val: buttons[index],
                    })
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

function addHeaderReferences({
    app,
    val,
    headings,
    section,
}: AddHeaderReferences) {
    if (headings) {
        headings.forEach((header: Heading) => {
            header.pos === section.pos &&
                createButtonElement({ app, block: header, val })
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
function createButtonElement({ app, block, val }: CreateButtonElement): void {
    const count = block && block.references ? block.references.size : 0

    const existingButton = val.querySelector("#count")
    const countEl = createEl("button", { cls: "block-ref-count" })
    countEl.setAttribute("data-block-ref-id", block.key)
    countEl.setAttribute("id", "count")
    countEl.innerText = count.toString()

    countEl.on("click", "button", async () => {
        const tempLeaf = app.workspace.getRightLeaf(false)
        await tempLeaf.setViewState({
            type: "search-ref",
            state: {
                //query: `--file:${block.page} /#(\\\^|\\\s)?${block.key}/ OR /(!)?${block.page}#(\\\^)?${block.key}/`,
                query: `((--file:("${block.page}.md") / \\^${block.key}$/) OR (--file:("${block.page}.md") /#\\^${block.key}\]\]/) OR ("^${block.key}" --/\\[\\[${block.page}#\\^${block.key}\\]\\]/)) OR ((--file:("${block.page}.md") (/#+ ${block.key}$/ OR /\\[\\[#${block.key}\\]\\]/)) OR /\\[\\[${block.page}#${block.key}\\]\\]/)`,

            },
        })
        const search = app.workspace.getLeavesOfType("search-ref")
        const searchElement = createSearchElement({ app, search, block })
        let searchHeight = (count + 1) * 85
        if (searchHeight < 300) { searchHeight = 300 }
        if (searchHeight > 600) { searchHeight = 600 }
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

function createSearchElement({ app, search, block }) {
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
