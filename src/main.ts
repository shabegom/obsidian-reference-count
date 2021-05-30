
import { App, EventRef, Plugin,   WorkspaceLeaf, TFile  } from "obsidian"
import { AddBlockReferences, CreateButtonElement, AddHeaderReferences, Heading, AddLinkReferences, Reference, EmbedOrLinkItem } from "./types"
import { indexBlockReferences, getPages } from "./indexer"

/**
 * BlockRefCounter Plugin
 * by shabegom and Murf
 * 
 * Iterates through the cache of all notes in a vault and creates an index of block-ids, headings, links referencing a block-id or heading, and embeds
 * Adds a button in Preview view with the count of references found
 * When button is clicked, reveals a table with links to each reference and line reference exists on
 */
export default class BlockRefCounter extends Plugin {
    private cacheUpdate: EventRef;
    private layoutReady: EventRef;
    private layoutChange: EventRef;
    private activeLeafChange: EventRef;
    private deleteFile: EventRef;
    private resolved: EventRef;

    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter")

        /**
         * Fire the initial indexing only if layoutReady = true
         * and if the metadataCache has been resolved for the first time
         * avoids trying to create an index while obsidian is indexing files
         */
        if (!this.app.workspace.layoutReady) {
            this.resolved = this.app.metadataCache.on("resolved", () => {
                indexBlockReferences({app: this.app})
                createPreviewView({ app: this.app })
                this.app.metadataCache.offref(this.resolved)
            })
        } else {
            indexBlockReferences({app: this.app})
            createPreviewView({ app: this.app })
        }

        

        
 
/**
 * Event listeners to re-index notes if the cache changes or a note is deleted
 * triggers creation of block ref buttons on the preview view
 */
        this.cacheUpdate = this.app.metadataCache.on("changed", () => {
            indexBlockReferences({app: this.app})
            createPreviewView({ app: this.app })
        })

        this.deleteFile = this.app.vault.on("delete", () => {
            indexBlockReferences({app: this.app})
            createPreviewView({ app: this.app })
        })

        this.layoutChange = this.app.workspace.on("layout-change", () => {
            this.app.workspace.activeLeaf.view.previewMode?.renderer.onRendered(() => {
                createPreviewView({ app: this.app })
            })

        })

        this.activeLeafChange = this.app.workspace.on("active-leaf-change", (leaf) => {
            createPreviewView({ leaf, app: this.app })
        })

    }

    onunload(): void {
        console.log("unloading plugin: Block Reference Counter")
        this.app.metadataCache.offref(this.cacheUpdate)
        this.app.workspace.offref(this.layoutReady)
        this.app.workspace.offref(this.layoutChange)
        this.app.workspace.offref(this.activeLeafChange)
        this.app.workspace.offref(this.deleteFile)
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
function createPreviewView({ leaf, app }: { leaf?: WorkspaceLeaf, app: App }) {
    const view = leaf ?  leaf.view : app.workspace.activeLeaf.view
    const sourcePath = view.file?.path
    // if previewMode exists and has sections, get the sections
    const elements = view.previewMode?.renderer?.sections
    const pages = getPages()
    const page = pages[0] && getPages().reduce((acc, page) => {
        if (page.file.path === sourcePath) {
            acc = page
        }
        return acc
    })

    if (page) {
        elements && elements.forEach((section, index) => {
            const pageSection = page.sections[index]
            if (pageSection) {
                pageSection.pos = pageSection.position.start.line
                const type = pageSection?.type
                // find embeds because their section.type is paragraph but they need to be processed differently
                const embedLinks = section.el.querySelectorAll(".markdown-embed")
                const embedLink = embedLinks ? embedLinks.item(0) : undefined

                if (page.blocks && !embedLink && type === "paragraph" || type === "list")
                    addBlockReferences({app, val: section.el, blocks: page.blocks, section: pageSection})

                if (page.headings && type === "heading") {
                    addHeaderReferences({app, val: section.el, headings: page.headings, section: pageSection})
                }

                if (page.items) {
                    addLinkReferences({app, val: section.el, links: page.items, section: pageSection, embedLink})
                }
            }
        
        })
    })
    
    
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
function addBlockReferences({ app, val, blocks, section}: AddBlockReferences): void {
    blocks && blocks.forEach(block => {
        section.type === "paragraph" && block.id === section.id &&  createButtonElement({app, block, val})
        // Iterate each list item and add the button to items with block-ids
        section.type === "list" && section.items.forEach((item, index: number) => {
            const buttons = val.querySelectorAll("li")
            item.id === block.key && createButtonElement({app, block, val: buttons[index]})
        })
    })
    
    
}

/**
 * Iterate through links (ncludes transculded embeds) and add a block ref button if the link has an associated block ref
 *
 * @param   {App}                     app        
 * @param   {HTMLElement}             val        HTMLElement to attach the button to
 * @param   {EmbedOrLinkItem[]}       links      Array of links and embeds from pages index
 * @param   {Section}                 section    Section object from pages index
 * @param   {HTMLELement}             embedLink  if there is an embedLink it is passed in from createPreviewView
 *
 * @return  {void}
 */
function addLinkReferences({app, val, links, section, embedLink}: AddLinkReferences) {
    links.forEach(link => {
        if (section.type === "paragraph" && section.pos === link.pos) {
            link.reference && embedLink && createButtonElement({app, block: link.reference, val: embedLink})
            link.reference && !embedLink && createButtonElement({app, block: link.reference, val})
        }
        // Have to iterate list items so the button gets attached to the right element
        if (section.type === "list") {
            section.items.forEach((item, index: number) => {
                const buttons = val.querySelectorAll("li")
                link.reference && embedLink && createButtonElement({app, block: link.reference, val: embedLink})
                if (link.reference && !embedLink && item.pos === link.pos) {
                    // change the type from link to block so createButtonElement adds the button to the right place

                    link.reference.type = "block"
                    createButtonElement({app, block: link.reference, val: buttons[index]})
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

function addHeaderReferences({app, val, headings, section}: AddHeaderReferences) {
    if (headings) {
        headings.forEach((header: Heading) => {
            header.pos === section.pos && createButtonElement({app, block: header, val})
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
    const countEl = createEl("button", { cls: "count" })
    countEl.setAttribute("id", "count")
    countEl.innerText = count.toString()

    const refTable: HTMLElement = createTable({app, val, files: block.references})

    countEl.on("click", "button", () => {
        if (!val.children.namedItem("ref-table")) {
            // depending on the type of block the table needs to be inserted into the DOM at different points

            block.type === "block"  && val.insertBefore(refTable, val.lastChild)
            block.type === "header" && val.appendChild(refTable)
            block.type === "link" && val.append(refTable)
        } else {
            if (val.children.namedItem("ref-table")) {
                val.removeChild(refTable)
            }
        }
    })
    if (existingButton) {
        existingButton.remove()
    }
    count > 0 && val.prepend(countEl)
}

/**
 * Generate an HTMLTable with links to each references note and the line with the reference
 *
 * @param   {App}              app      
 * @param   {HTMLElement}      val      if the X emoji is clicked the table is removed from this element
 * @param   {Reference[]}      files    An object of files that have the associated reference to the block-id
 *
 * @return  {HTMLTableElement}               
 */
function createTable({app, val, files}: {app: App, val: HTMLElement | Element, files: Reference[] | Set<unknown> | void}) {
    const refTable = createEl("table", {cls: "ref-table"})
    refTable.setAttribute("id", "ref-table")

    const noteHeaderRow = createEl("tr").appendChild(createEl("th", {text: "Note"}))
    const lineHeaderRow = createEl("tr").appendChild(createEl("th", {text: "Reference", cls: "reference"}))
    const removeTable = createEl("button", {text: "❌" })
    lineHeaderRow.appendChild(removeTable)
    removeTable.on("click", "button", () => {val.removeChild(refTable)})

    refTable.appendChild(noteHeaderRow)
    refTable.appendChild(lineHeaderRow)
    refTable.appendChild(removeTable)


    files && files.forEach(async ( file: Reference ) => {
        const tFile = app.vault.getAbstractFileByPath(file.path) as TFile
        const lineContent = await app.vault.cachedRead(tFile).then(content => content.split("\n")[file.pos])

        const row = createEl("tr")
        const noteCell = createEl("td")
        const lineCell = createEl("td")
        noteCell.appendChild(createEl("a", { cls: "internal-link", href: file.path, text: file.basename }))
        lineCell.appendChild(createEl("span", {text: lineContent}))
        row.appendChild(noteCell)
        row.appendChild(lineCell)
        refTable.appendChild(row)
    })
    return refTable

}
