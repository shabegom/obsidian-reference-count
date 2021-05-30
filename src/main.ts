import { App, EventRef, Plugin,   WorkspaceLeaf } from "obsidian"
import { AddBlockReferences, CreateButtonElement, FileRef, AddHeaderReferences, Heading, AddLinkReferences } from "./types"
import { indexBlockReferences, getPages } from "./indexer"

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
            this.layoutReady = this.app.workspace.on("layout-ready", () => indexBlockReferences({app: this.app}))
        } else {
            indexBlockReferences({app: this.app})
        }
 

        this.cacheUpdate = this.app.metadataCache.on("changed", () => {
            indexBlockReferences({app: this.app})
            createPreviewView({app: this.app})
        })

        this.deleteFile = this.app.vault.on("delete", () => {
            indexBlockReferences({app: this.app})
            createPreviewView({app: this.app})
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
        const pageSection = page.sections[index]
        if (pageSection) {
            pageSection.pos = pageSection.position.start.line
            const type = pageSection?.type
            if (page.items) {
                addLinkReferences({app, val: section.el, links: page.items, section: pageSection})
            }
            if (page.blocks && type === "paragraph" || type === "list")
                addBlockReferences({app, val: section.el, blocks: page.blocks, section: pageSection})
            if (page.headings && type === "heading") {
                addHeaderReferences({app, val: section.el, headings: page.headings, section: pageSection})
            }
        }
        
    })
}

function addBlockReferences({ app, val, blocks, section}: AddBlockReferences): void {
    blocks && blocks.forEach(block => {
        section.type === "paragraph" && block.id === section.id &&  createButtonElement({app, block, val})
        section.type === "list" && section.items.forEach((item, index: number) => {
            const buttons = val.querySelectorAll("li")
            item.id === block.key && createButtonElement({app, block, val: buttons[index]})
        })
    })
    
    
}

function addLinkReferences({app, val, links, section}: AddLinkReferences) {
    links && links.forEach(link => {
        if (section.type === "paragraph" && section.pos === link.pos) {
            const embedLink = link.embed ? val.querySelectorAll(".markdown-embed-link").item(0) : undefined
            embedLink && createButtonElement({app, block: link.reference, val: embedLink.parentElement})
            !embedLink && createButtonElement({app, block: link.reference, val: val})
        }
        if (section.type === "list") {
            section.items.forEach((item, index: number) => {
                const buttons = val.querySelectorAll("li")
                const embedLink = link.embed ? val.querySelectorAll(".markdown-embed-link").item(0) : undefined
                embedLink && createButtonElement({app, block: link.reference, val: embedLink.parentElement})
                if (!embedLink && item.pos === link.pos) {
                    link.reference.type = "block"
                    createButtonElement({app, block: link.reference, val: buttons[index]})
                }
            }) 
        }
    })
}

function addHeaderReferences({app, val, headings, section}: AddHeaderReferences) {
    if (headings) {
        headings.forEach((header: Heading) => {
            header.pos === section.pos && createButtonElement({app, block: header, val})
        })
    }
}

function createButtonElement({ app, block, val }: CreateButtonElement): void {
    const refs = block.references ? Array.from(block.references) : undefined
    const count = refs ? refs.length : 0
    const existingButton = val.querySelector("#count")
    const countEl = createEl("button", { cls: "count" })
    countEl.setAttribute("id", "count")
    countEl.innerText = count.toString()
    const refTable: HTMLElement = createTable({app, val, files: refs})
    countEl.on("click", "button", () => {
        if (!val.children.namedItem("ref-table")) {
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

function createTable({app, val, files}: {app: App, val: HTMLElement, files: FileRef[]}) {
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
    files && files.forEach(async ( fileRef ) => {
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
