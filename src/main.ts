import { App, EmbedCache, LinkCache, ListItemCache, EventRef, Plugin } from "obsidian"
import { AddBlockReferences, CreateButtonElement, CountBlockReferences, FileRef, BlockRefs } from './types'
import {indexBlockReferences, buildIndexObjects, getIndex} from './indexer'


export default class BlockRefCounter extends Plugin {
    private cacheUpdate: EventRef;
    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter")
        		if (!this.app.workspace.layoutReady) {
			this.app.workspace.on("layout-ready", async () => this.prepareIndexes());
		} else {
			indexBlockReferences({app: this.app})
		}

        this.cacheUpdate = this.app.metadataCache.on('changed', (file) => {
            console.log('updating cache')
            const {blocks, embeds, links} = this.app.metadataCache.getFileCache(file)
            buildIndexObjects({blocks, embeds, links, file}) 
        })

        this.registerMarkdownPostProcessor((val, ctx) => {
            addBlockReferences({app: this.app, ctx, val})
        })
  
    }

    onunload() {
        console.log("unloading plugin: Block Reference Counter")
        this.app.metadataCache.off(this.cacheUpdate)
    }
}




function addBlockReferences({app, ctx, val }: AddBlockReferences): void {
    const blockRefs = getIndex()
    const { blocks, listItems, sections } = app.metadataCache.getCache(ctx.sourcePath) || {}
    const listSections = sections.filter(section => section.type === "list").map(section => {
        const items: ListItemCache[] = []
        listItems.forEach(item => {
            if (item.position.start.line >= section.position.start.line && item.position.start.line <= section.position.end.line) {
                items.push(item)
            }
        })
        return {section, items}
    })
    const listElements = val.querySelectorAll("li")
    if (blocks) {
        const {lineStart} = ctx.getSectionInfo(val) || {}
        Object.values(blocks).forEach((block) => {
            if (blockRefs[block.id]) {
                if (sections) {
                    sections.forEach(section => {
                        if (section.id === block.id && lineStart === block.position.start.line) {
                            createButtonElement({app, blockRefs: blockRefs[block.id], val})
                        }

                    })
                }
                if (listItems && listElements.length > 0) {
                    listSections.forEach((section) => {
                        section.items.forEach(( listItem, index ) => {
                            if (listItem.id === block.id && lineStart === section.section.position.start.line) {
                                if (listElements.item(index)) {
                                    createButtonElement({app, blockRefs: blockRefs[block.id], val: listElements.item(index)})
                                }
                            }
                        })
                    })
                }
            }
        })
    }
}


function createButtonElement({app, blockRefs, val }: CreateButtonElement): void {
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
    val.prepend(countEl)
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

