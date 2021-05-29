import {App} from "obsidian"
import {Pages, EmbedOrLinkItem, BuildIndexObjects} from "./types"

let pages = []

export function getPages(): Pages {
    return [...pages]
}



export function indexBlockReferences({ app }: { app: App }): void {
    pages = []
    const files = app.vault.getMarkdownFiles()
    files.forEach(file => {
        const { links, embeds, headings, blocks, sections, listItems} = app.metadataCache.getFileCache(file) || {}
        buildPagesArray({embeds, links, headings, blocks, file, sections, listItems})
    })

    buildObjects({pages, currentPage: 0, allLinks: []})
    console.log(pages)
}

function buildPagesArray({embeds, links, file, headings, blocks, sections, listItems}) {
    embeds = embeds ? embeds : []
    links = links ? links : []
    blocks = blocks && Object.entries(blocks).map(([key, block]) => ({
        count: 0,
        key,
        pos: block.position.start.line,
        id: block.id,
        references: new Set(),
        type: "block"
    }))
    headings = headings && headings.map(header => ({
        count: 0,
        key: header.heading,
        pos: header.position.start.line,
        references: new Set(),
        type: "header"
    }))
    const foundItems = findItems([...embeds, ...links], file)
    const listSections = createListSections({sections, listItems})
    if (foundItems) {
        pages.push({
            file,
            links: foundItems,
            headings,
            blocks,
            sections: listSections
        })
    }
    
}

export function removePageFromArray({file}) {
    pages = pages.filter(page => page.file.basename !== file.basename)
}

export function addPageToArray({app, file}) {
    const { links, embeds, headings, blocks, sections, listItems} = app.metadataCache.getFileCache(file) || {}
    removePageFromArray({file})
    buildPagesArray({embeds, links, headings, blocks, file, sections, listItems})
    buildObjects({pages, currentPage: 0, allLinks: []})
}

function createListSections({sections, listItems}) {
    if (listItems) {
        return sections.map(section => {
            const items: ListItemCache[] = []
            if (section.type === "list") {
                listItems.forEach((item)=> {
                    if (item.position.start.line >= section.position.start.line && item.position.start.line <= section.position.end.line) {
                        items.push(item)
                    }
                })
                section.items = items
                return section
            }
            return section
        })
    }
    return sections
}

function buildObjects({pages, currentPage, allLinks}) {
    const numPages = pages.length
    if (currentPage > numPages) {
        pages.forEach(page => {
            allLinks.forEach(link => {
                page.blocks && page.blocks.forEach(block => {
                    if (link.type === 'block' && link.id === block.key) {
                        block.count = Array.from(block.references).length
                        block.references.add(link)
                    }
                })
                page.headings && page.headings.forEach((heading) => {
                    if (link.type === 'heading' && link.id === heading.key) {
                        heading.count = Array.from(heading.references).length
                        heading.references.add(link)
                    } 
                })
            })
        })
        return
    }
    pages.forEach((page) => {
        if (page.links) {
            allLinks.push(...page.links)
        }
    })
    currentPage++
    buildObjects({pages, currentPage, allLinks})
}




function findItems(items, file) {
    const foundItems: EmbedOrLinkItem[] = []
    const basename = file.basename
    if (items) {
        items.forEach(item => {
            const [note, id] = item.link.split("^")
            const pos = item.position.start.line
            const page = (note.split("#")[0] ? note.split("#")[0] : basename)
            const header = item.link.match(/.*#(.*)/)
            if (id) {
                foundItems.push(
                    {
                        id,
                        pos,
                        page,
                        file,
                        type: "block"
                    }
                )
            } 
            if (header) {
                const page = (note ? note : basename)
                foundItems.push(
                    {
                        id: header[1],
                        pos,
                        page,
                        file,
                        type: "heading"
                    }
                )
            }
        })
    }
    return foundItems
}