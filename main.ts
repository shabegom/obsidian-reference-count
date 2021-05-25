import { App, Plugin, BlockCache, LinkCache, EmbedCache, TFile, MarkdownPostProcessorContext, ListItemCache } from "obsidian"
declare module "obsidian" {
  interface View {
    setCollapseAll(collapse: boolean): void;
    setQuery(queryStr: string): void;
  }
}

export default class BlockRefCounter extends Plugin {
    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter")
        this.registerMarkdownPostProcessor((val, ctx) => {
            addBlockReferences({app: this.app, ctx, val}) 
        })
    }

    onunload() {
        console.log("unloading plugin: Block Reference Counter")
    }
}

interface AddBlockReferences {
  app: App
  ctx: MarkdownPostProcessorContext
  val: HTMLElement
}


function addBlockReferences({app, ctx, val }: AddBlockReferences): void {
    const files = app.vault.getMarkdownFiles()
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
            const blockRefs = getBlockReferences({app, block, files})
            if (blockRefs.count > 0) {
                if (sections) {
                    sections.forEach(section => {
                        if (section.id === block.id && lineStart === block.position.start.line) {
                            createButtonElement({app, blockRefs, val})
                        }

                    })
                }
                if (listItems && listElements.length > 0) {
                    listSections.forEach((section) => {
                        section.items.forEach(( listItem, index ) => {
                            if (listItem.id === block.id && lineStart === section.section.position.start.line) {
                                if (listElements.item(index)) {
                                    createButtonElement({app, blockRefs, val: listElements.item(index)})
                                }
                            }
                        })
                    })
                }
            }
        })
    }
}

interface CreateButtonElement {
  app: App
  blockRefs: {count: number, files: Set<FileRef>}
  val: HTMLElement
}

function createButtonElement({app, blockRefs, val }: CreateButtonElement): void {
    const countEl = createEl("button", { cls: "count" })
    countEl.innerText = blockRefs.count.toString()
    const refTable: HTMLElement = createTable({app, val, files: Array.from(blockRefs.files)})
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



interface CountBlockReferences {
  app: App
  block: BlockCache
  files: TFile[]
}

interface FileRef {
  file: TFile
  line: number
}

interface BlockRefs {
  count: number
  files : Set<any>
}


function getBlockReferences({ app, block, files }: CountBlockReferences): BlockRefs {
    return files.reduce((acc, file) => {
        const { embeds, links } = app.metadataCache.getFileCache(
            file
        ) || {}
        if (embeds) {
            const embedRefs = embeds.reduce((acc, embed: EmbedCache) => {
                if (embed.link.split("^")[1] === block.id) {
                    acc.count++
                    acc.files.push({file, line: embed.position.start.line})

                }
                return acc
            }, {count: 0, files: [], lines: []})
            acc.count += embedRefs.count
            embedRefs.files.forEach(file => acc.files.add(file))
        }
        if (links) {
            const linkRefs = links.reduce((acc, link: LinkCache) => {
                if (link.link.split("^")[1] === block.id) {
                    acc.count++
                    acc.files.push({file, line: link.position.start.line})

                }
                return acc
            }, {count: 0, files: [], lines: []})
            acc.count += linkRefs.count
            linkRefs.files.forEach(file => acc.files.add(file))
        }
        return acc
    }, {count: 0, files: new Set()})
}
