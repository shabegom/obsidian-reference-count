import { App, Plugin, BlockCache, LinkCache, Loc, EmbedCache, TFile, MarkdownPostProcessorContext, WorkspaceLeaf, ValueComponent, FileSystemAdapter } from "obsidian"
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
    if (blocks) {
        const {lineStart} = ctx.getSectionInfo(val)
        Object.values(blocks).forEach((block) => {
            const count = countBlockReferences({app, block, files })
            const blockRefs = getBlockReferences({app, block, files})
            console.log(blockRefs)
            if (count > 0) {
                if (sections) {
                    sections.forEach(section => {
                        if (section.id === block.id && section.position.start.line === lineStart) {
                            createButtonElement({blockRefs, val})
                        }

                    })
                }
                if (listItems) {
                    listItems.forEach((listItem, index) => {
                        const listElements = val.querySelectorAll("li")
                        if (listItem.id === block.id) {
                            if (listElements.item(index)) {
                                createButtonElement({blockRefs, val: listElements.item(index)})

                            }
                        }
                    })
                }
            }
        })
    }
}

interface CreateButtonElement {
  blockRefs: {count: number, files: Set<TFile>}
  val: HTMLElement
}

function createButtonElement({blockRefs, val }: CreateButtonElement): void {
    const countEl = createEl("button", { cls: "count" })
    const refTable = createEl("table", {cls: "ref-table"})
    const headerRow = createEl("tr").appendChild(createEl("th", {text: "Notes"}))
    const removeTable = createEl("tr").appendChild(createEl("button", {text: "❌"}))
    removeTable.on("click", "button", () => {val.removeChild(refTable)})
    refTable.appendChild(headerRow)
    refTable.appendChild(removeTable)
    Array.from(blockRefs.files).forEach(file => {
        const row = createEl("tr")
        const cell = createEl("td")
        cell.appendChild(createEl("a", {cls: "internal-link", href: file.path, text: file.name.split(".")[0]}))
        row.appendChild(cell)
        refTable.appendChild(row)
    })
    countEl.innerText = blockRefs.count.toString()
    countEl.on("click", "button", () => {
        if (val.lastChild !== refTable) {
            val.appendChild(refTable)
        } else {
            val.removeChild(refTable)
        }
    })
    val.prepend(countEl)
}



interface CountBlockReferences {
  app: App
  block: BlockCache
  files: TFile[]
}

function countBlockReferences({ app, block, files }: CountBlockReferences): number {
    return files.reduce((acc, file) => {
        const { embeds, links } = app.metadataCache.getFileCache(
            file
        ) || {}
        if (embeds) {
            acc += embeds.reduce((acc: number, embed: EmbedCache) => {
                if (embed.link.split("^")[1] === block.id) {
                    acc++
                }
                return acc
            }, 0)
        }
        if (links) {
            acc += links.reduce((acc: number, link: LinkCache) => {
                if (link.link.split("^")[1] === block.id) {
                    acc++
                }
                return acc
            }, 0)
        }
        return acc
    }, 0)}

interface BlockRefs {
  count: number
  files: Set<any>
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
                    acc.files.push(file)

                }
                return acc
            }, {count: 0, files: [], lines: []})
            embedRefs.files.forEach(file => acc.files.add(file))
        }
        if (links) {
            const linkRefs = links.reduce((acc, link: LinkCache) => {
                if (link.link.split("^")[1] === block.id) {
                    acc.count++
                    acc.files.push(file)

                }
                return acc
            }, {count: 0, files: [], lines: []})
            acc.count += linkRefs.count
            linkRefs.files.forEach(file => acc.files.add(file))
        }
        return acc
    }, {count: 0, files: new Set()})
}