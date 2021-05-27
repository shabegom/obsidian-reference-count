import { App, ListItemCache, EventRef, Plugin, TFile, MarkdownPreviewView, WorkspaceLeaf} from "obsidian"
import { AddBlockReferences, CreateButtonElement, FileRef, } from "./types"
import { indexBlockReferences, buildIndexObjects, updateIndex, getIndex } from "./indexer"

export default class BlockRefCounter extends Plugin {
    private cacheUpdate: EventRef;
    private layoutReady: EventRef;
    private layoutChange: EventRef;
    private activeLeafChange: EventRef;
    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter")

        if (!this.app.workspace.layoutReady) {
            this.layoutReady = this.app.workspace.on("layout-ready", async () => indexBlockReferences({app: this.app}))
        } else {
            indexBlockReferences({app: this.app})
        }

        this.cacheUpdate = this.app.metadataCache.on("changed", (file) => {
            console.log("updating cache: " + file.basename)
            const {blocks, embeds, links} = this.app.metadataCache.getFileCache(file)
            buildIndexObjects({ blocks, embeds, links, file })
            updateIndex()
            createPreviewView({app: this.app})
        })

        this.layoutChange = this.app.workspace.on("layout-change", () => {
            console.log("layout change")
            createPreviewView({app: this.app})
        })

        this.activeLeafChange = this.app.workspace.on("active-leaf-change", (leaf) => {
            console.log("active leaf change")
            createPreviewView({leaf, app: this.app})
        })

        this.registerMarkdownPostProcessor((val, ctx) => {
            addBlockReferences({app: this.app, ctx, val})
        })
  
    }

    onunload(): void {
        console.log("unloading plugin: Block Reference Counter")
        this.app.metadataCache.offref(this.cacheUpdate)
        this.app.workspace.offref(this.layoutReady)
        this.app.workspace.offref(this.layoutChange)
        this.app.workspace.offref(this.activeLeafChange)
    }
}

function createPreviewView({leaf, app}: {leaf?: WorkspaceLeaf, app: App}) {
    const view = leaf ?  leaf.view : app.workspace.activeLeaf.view
    const sourcePath = view.file?.path
    const sections = view.previewMode?.renderer.sections
    if (sourcePath && sections) {
        sections.forEach((section: { lineStart: number; lineEnd: number; el: HTMLElement; }) => {
            const lineStart = section.lineStart
            const lineEnd = section.lineEnd
            const val = section.el
            const getSectionInfo = (val: HTMLElement) => ({val, lineStart, lineEnd, text: ""})

            addBlockReferences({app: app, ctx: {getSectionInfo, sourcePath}, val })
        })

    }

}

function addBlockReferences({ app, ctx, val }: AddBlockReferences): void {
    const { lineStart, lineEnd } = ctx.getSectionInfo(val) || {}
    //console.log(`markdownPostProcessor: Ln${lineStart}-${lineEnd}`)
    const { blocks, listItems, sections } = app.metadataCache.getCache(ctx.sourcePath) || {}
    if (blocks) {
        const matchedBlock = Object.values(blocks).find((eachBlock) => { if (eachBlock.position.start.line >= lineStart && eachBlock.position.start.line <= lineEnd) { return true } else { return false } })
        if (matchedBlock) {
            console.log("markdownPostProcessor Block Ref section...")
            const blockRefs = getIndex()
            const thisFile = app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile
            const listSections = sections.filter(section => section.type === "list").map(section => {
                const items: ListItemCache[] = []
                listItems.forEach(item => {
                    if (item.position.start.line >= section.position.start.line && item.position.start.line <= section.position.end.line) {
                        items.push(item)
                    }
                })
                return { section, items }
            })
            const listElements = val.querySelectorAll("li")

            Object.values(blocks).forEach((block) => {
                const myId = `${thisFile.basename}^${block.id}`
                if (blockRefs[myId] && blockRefs[myId]) {
                    if (sections) {
                        sections.forEach(section => {
                            if (section.id === block.id && lineStart === block.position.start.line) {
                                createButtonElement({ app, blockRefs: blockRefs[myId], val })
                            }

                        })
                    }
                    if (listItems && listElements.length > 0) {
                        listSections.forEach((section) => {
                            section.items.forEach((listItem, index) => {
                                if (listItem.id === block.id && lineStart === section.section.position.start.line) {
                                    if (listElements.item(index)) {
                                        createButtonElement({ app, blockRefs: blockRefs[myId], val: listElements.item(index) })
                                    }
                                }
                            })
                        })
                    }
                }
            })
        }
    }
}

function createButtonElement({app, blockRefs, val }: CreateButtonElement): void {
    const existingButton = val.querySelectorAll(".count").item(0)
    const countEl = createEl("button", { cls: "count" })
    countEl.innerText = blockRefs.count.toString()
    const refTable: HTMLElement = createTable({app, val, files: Array.from(blockRefs.references)})
    countEl.on("click", "button", () => {
        if (val.lastChild.previousSibling !== refTable) {
            val.insertBefore(refTable, val.lastChild)
        } else {
            val.removeChild(refTable)
        }
    })
    existingButton && existingButton.remove()
    if (blockRefs.count > 0) {
        val.prepend(countEl)
    }

}

function createTable({app, val, files}: {app: App, val: HTMLElement, files: FileRef[]}) {
    const refTable = createEl("table", {cls: "ref-table"})
    const noteHeaderRow = createEl("tr").appendChild(createEl("th", {text: "Note"}))
    const lineHeaderRow = createEl("tr").appendChild(createEl("th", {text: "Reference", cls: "reference"}))
    const removeTable = createEl("button", {text: "❌" })
    lineHeaderRow.appendChild(removeTable)
    removeTable.on("click", "button", () => {val.removeChild(refTable)})
    refTable.appendChild(noteHeaderRow)
    refTable.appendChild(lineHeaderRow)
    refTable.appendChild(removeTable)
    files.forEach(async ( fileRef ) => {
        const lineContent = await app.vault.cachedRead(fileRef.file).then(content => content.split("\n")[fileRef.line])
        const row = createEl("tr")
        const noteCell = createEl("td")
        const lineCell = createEl("td")
        noteCell.appendChild(createEl("a", {cls: "internal-link", href: fileRef.file.path, text: fileRef.file.name.split(".")[0]}))
        lineCell.appendChild(createEl("span", {text: lineContent}))
        row.appendChild(noteCell)
        row.appendChild(lineCell)
        refTable.appendChild(row)
    })
    return refTable

}
