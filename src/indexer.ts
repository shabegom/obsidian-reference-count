import {App, LinkCache, EmbedCache, renderResults} from "obsidian"
import {CountBlockReferences, BlockRefs} from "./types"

const index = {}

export function getIndex() {
    return Object.assign({}, index)
}

export function updateIndex({update}) {
    const updateKeys = Object.keys(update)
    updateKeys.forEach((key) => {
        index[key] = update[key]
    })
}

export function indexBlockReferences({ app }: {app: App}) {
    console.time("index")
    const files = app.vault.getMarkdownFiles()
    files.forEach(file => {
        const {blocks, links, embeds} = app.metadataCache.getFileCache(file) || {}
        buildIndexObjects({blocks, embeds, links, file})

    })
    console.timeEnd("index")
}

export function buildIndexObjects({blocks, embeds, links, file}) {
    const update = {}
    if (blocks) {
        Object.values(blocks).forEach((block) => {
            update[block.id] = {
                count: 0,
                id: block.id,
                file: file,
                references: new Set()
            }
            
        })
    }
    if (embeds) {
        embeds.forEach(embed => {
            const split = embed.link.split("^")
            const id = split[1]
            if (id && update[id]) {
                update[id].count++
                update[id].references.add({file, line: embed.position.start.line})
            }
        })
    }
    if (links) {
        links.forEach(link => {
            const split = link.link.split("^")
            const id = split[1]
            if (id && update[id]) {
                update[id].count++
                update[id].references.add({file, line: link.position.start.line})
            }
        })
    }
    updateIndex({update})
}