import {App} from "obsidian"
import {Index, Pages, EmbedOrLinkItem, BuildIndexObjects} from "./types"

const index: Index = {}
const pages: Pages = {}

export function getIndex(): Index {
    return Object.assign({}, index)
}

export function getPages(): Pages {
    return Object.assign({}, pages)
}

export function updateIndex(): void {
    //console.log('updateIndex()')
    Object.keys(index).forEach(key => {
        index[key].count = 0
        index[key].references.clear()
    })
    Object.values(pages).forEach(eachPage => {
        eachPage.embeds.forEach(embed => {
            const id = `${embed.page}^${embed.id}`
            if (index[id]) {
                index[id].count++
                index[id].references.add({ file: embed.file, line: embed.pos })
            }
        })
        eachPage.links.forEach(link => {
            const id = `${link.page}^${link.id}`
            if (index[id]) {
                index[id].count++
                index[id].references.add({ file: link.file, line: link.pos })
            }
        })
    })
    //console.log(index);
}

export function indexBlockReferences({ app }: { app: App }): void {
    console.log("Full initial index!")
    console.time("index")
    const files = app.vault.getMarkdownFiles()
    files.forEach(file => {
        const { blocks, links, embeds } = app.metadataCache.getFileCache(file) || {}
        buildIndexObjects({ blocks, embeds, links, file })
    })
    updateIndex()
    console.timeEnd("index")
}

export function buildIndexObjects({blocks, embeds, links, file}: BuildIndexObjects): void {
    if (pages[file.path]) { delete pages[file.path] }

    if (blocks) {
        Object.values(blocks).forEach((block) => {
            const newid = `${file.basename}^${block.id}`
            index[newid] = {
                count: 0,
                id: newid,
                file: file,
                references: new Set()
            }
        })
    }
    const foundEmbeds: EmbedOrLinkItem[] = []
    if (embeds) {
        embeds.forEach(embed => {
            const split = embed.link.split("^")
            const id = split[1]
            if (id) {
                const page = (split[0].split("#")[0] ? split[0].split("#")[0] : file.basename)
                foundEmbeds.push(
                    {
                        id,
                        file,
                        pos: embed.position.start.line,
                        page
                    }
                )
            }
        })
    }

    const foundLinks: EmbedOrLinkItem[] = []
    if (links) {
        links.forEach(link => {
            const split = link.link.split("^")
            const id = split[1]
            if (id) {
                const page = (split[0].split("#")[0] ? split[0].split("#")[0] : file.basename)
                foundLinks.push(
                    {
                        id,
                        file,
                        pos: link.position.start.line,
                        page
                    }
                )
            }
        })
    }

    if (foundEmbeds.length > 0 || foundLinks.length > 0) {
        pages[file.path] = {
            embeds: foundEmbeds,
            links: foundLinks
        }
    }
}