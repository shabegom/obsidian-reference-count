import {App, LinkCache, EmbedCache, renderResults} from "obsidian"
import {CountBlockReferences, BlockRefs} from "./types"

const index = {}
const pages = {}

export function getIndex() {
    return Object.assign({}, index)
}

export function updateIndex() {
    //console.log('updateIndex()')
    Object.entries(index).forEach(eachItem => {
        index[eachItem[0]].count = 0;
        index[eachItem[0]].references.clear();
    })
    Object.entries(pages).forEach(eachPage => {
        eachPage[1].embeds.forEach(embed => {
            const id = `${embed[3]}^${embed[0]}`;
            if (index[id]) {
                index[id].count++
                index[id].references.add({ file: embed[1], line: embed[2] })
            }
        })
        eachPage[1].links.forEach(link => {
            const id = `${link[3]}^${link[0]}`;
            if (index[id]) {
                index[id].count++
                index[id].references.add({ file: link[1], line: link[2] })
            }
        })
    })
    //console.log(index);
}

export function indexBlockReferences({ app }: { app: App }) {
    console.log('Full initial index!')
    console.time("index")
    const files = app.vault.getMarkdownFiles()
    files.forEach(file => {
        const { blocks, links, embeds } = app.metadataCache.getFileCache(file) || {}
        buildIndexObjects({ blocks, embeds, links, file })
    })
    updateIndex()
    console.timeEnd("index")
}

export function buildIndexObjects({blocks, embeds, links, file}) {
    if (pages[file.path]) { delete pages[file.path] }

    if (blocks) {
        Object.values(blocks).forEach((block) => {
            const newid = `${file.basename}^${block.id}`;
            index[newid] = {
                count: 0,
                id: newid,
                file: file,
                references: new Set()
            }
        })
    }
    let foundEmbeds = [];
    if (embeds) {
        embeds.forEach(embed => {
            const split = embed.link.split("^")
            const id = split[1]
            if (id) {
                const page = (split[0].split("#")[0] ? split[0].split("#")[0] : file.basename)
                foundEmbeds.push(
                    [
                        id,
                        file,
                        embed.position.start.line,
                        page
                    ]
                )
            }
        })
    }

    let foundLinks = [];
    if (links) {
        links.forEach(link => {
            const split = link.link.split("^")
            const id = split[1]
            if (id) {
                const page = (split[0].split("#")[0] ? split[0].split("#")[0] : file.basename)
                foundLinks.push(
                    [
                        id,
                        file,
                        link.position.start.line,
                        page
                    ]
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