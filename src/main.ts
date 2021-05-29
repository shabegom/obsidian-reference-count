import { App, ListItemCache, EventRef, Plugin, TFile, MarkdownPreviewView, WorkspaceLeaf, BlockCache, EmbedCache, LinkCache, HeadingCache } from "obsidian"
import { AddBlockReferences, CreateButtonElement, EmbedOrLinkItem, FileRef, } from "./types"
import { indexBlockReferences, getPages, removePageFromArray, addPageToArray } from "./indexer"

export default class BlockRefCounter extends Plugin {
    private cacheUpdate: EventRef;
    private layoutReady: EventRef;
    private layoutChange: EventRef;
    private activeLeafChange: EventRef;
    private newFile: EventRef;
    private deleteFile: EventRef;
    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter")


        if (!this.app.workspace.layoutReady) {
            this.layoutReady = this.app.workspace.on("layout-ready", async () => indexBlockReferences({app: this.app}))
        } else {
            indexBlockReferences({app: this.app})
        }
 

        this.cacheUpdate = this.app.metadataCache.on("changed", (file) => {
            console.log("updating cache: " + file.basename)
            addPageToArray({app: this.app, file})
        })

         this.deleteFile = this.app.vault.on("delete", (file) => {
            removePageFromArray({file})
        })

        this.layoutChange = this.app.workspace.on("layout-change", () => {
            console.log("layout change")
                    this.app.workspace.activeLeaf.view.previewMode?.renderer.onRendered(() => {
                        createPreviewView({ app: this.app })
                    })

        })

        this.activeLeafChange = this.app.workspace.on("active-leaf-change", (leaf) => {
            console.log("active leaf change")
            createPreviewView({ leaf, app: this.app })
        })

    }

    onunload(): void {
        console.log("unloading plugin: Block Reference Counter")
        this.app.metadataCache.offref(this.cacheUpdate)
        this.app.workspace.offref(this.layoutReady)
        this.app.workspace.offref(this.layoutChange)
        this.app.workspace.offref(this.activeLeafChange)
        this.app.workspace.offref(this.newFile)
        this.app.workspace.offref(this.deleteFile)
    }
}



function createPreviewView({ leaf, app }: { leaf?: WorkspaceLeaf, app: App }) {
    const view = leaf ?  leaf.view : app.workspace.activeLeaf.view
    const sourcePath = view.file?.path
    const elements = view.previewMode?.renderer?.sections
    const page = getPages().reduce((acc, page) => {
        if (page.file.path === sourcePath) {
            acc = page
        }
        return acc
    })
    elements && elements.forEach((section, index) => {
        addBlockReferences({app, val: section.el, blocks: page.blocks, section: page.sections[index]})
        if (page.sections[index].type === 'heading') {
            addHeaderReferences({app, val: section.el, headings: page.headings})
        }
    })
}


function addBlockReferences({ app, val, blocks, section}: AddBlockReferences): void {
    if (blocks) {
        blocks.forEach(block => {
            section.type === 'paragraph' && createButtonElement({app, block, val})
            section.type === 'list' && section.items.forEach(((item, index) => {
                const buttons = val.querySelectorAll('li')
                item.id === block.key && createButtonElement({app, block, val: buttons[index]})
            })
        })
    }
}

function addHeaderReferences({app, val, headings}) {
    if (headings) {
        headings.forEach(header => {
            createButtonElement({app, block: header, val: val})
        })
    }
}

function createButtonElement({ app, block, val }: CreateButtonElement): void {
    const existingButton = val.querySelectorAll(".count").item(0)
    const countEl = createEl("button", { cls: "count" })
    countEl.innerText = block.count.toString()
    const refTable: HTMLElement = createTable({app, val, files: Array.from(block.references)})
    countEl.on("click", "button", () => {
        if (!val.children.namedItem('ref-table')) {
            block.type === 'block' && val.insertBefore(refTable, val.lastChild)
            block.type === 'header' && val.appendChild(refTable)
        } else {
        if (val.children.namedItem('ref-table')) {
            val.removeChild(refTable)
        }
        }


    })
    existingButton && existingButton.remove()
    block.count > 0 &&  val.prepend(countEl)
}

function createTable({app, val, files}: {app: App, val: HTMLElement, files: FileRef[]}) {
    const refTable = createEl("table", {cls: "ref-table"})
    refTable.setAttribute('id', 'ref-table')
    const noteHeaderRow = createEl("tr").appendChild(createEl("th", {text: "Note"}))
    const lineHeaderRow = createEl("tr").appendChild(createEl("th", {text: "Reference", cls: "reference"}))
    const removeTable = createEl("button", {text: "❌" })
    lineHeaderRow.appendChild(removeTable)
    removeTable.on("click", "button", () => {val.removeChild(refTable)})
    refTable.appendChild(noteHeaderRow)
    refTable.appendChild(lineHeaderRow)
    refTable.appendChild(removeTable)
    files.forEach(async ( fileRef ) => {
        const lineContent = await app.vault.cachedRead(fileRef.file).then(content => content.split("\n")[fileRef.pos])
        const row = createEl("tr")
        const noteCell = createEl("td")
        const lineCell = createEl("td")
        noteCell.appendChild(createEl("a", { cls: "internal-link", href: fileRef.file.path, text: fileRef.file.basename }))
        lineCell.appendChild(createEl("span", {text: lineContent}))
        row.appendChild(noteCell)
        row.appendChild(lineCell)
        refTable.appendChild(row)
    })
    return refTable

}
