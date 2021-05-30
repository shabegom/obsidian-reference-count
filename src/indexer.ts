import {App} from "obsidian"
import {Page, EmbedOrLinkItem, BuildPagesArray, CreateListSections, Section, ListItem, FindItems} from "./types"

let pages: Page[] = []

export function getPages(): Page[] {
    return [...pages]
}

export function indexBlockReferences({ app }: { app: App }): void {
    pages = []
    const files = app.vault.getMarkdownFiles()
    let i = 0
    while (i < files.length) {
        const { links, embeds, headings, blocks, sections, listItems} = app.metadataCache.getFileCache(files[i])
        buildPagesArray({embeds, links, headings, blocks, sections, listItems, file: files[i]})
        i++
    }
    buildObjects({pages})
    buildLinksAndEmbeds({pages})
}

function buildPagesArray({embeds, links, headings, blocks, sections, listItems, file}: BuildPagesArray) {
    embeds = embeds ? embeds : []
    links = links ? links : []
    const blocksArray = blocks && Object.entries(blocks).map(([key, block]) => ({
        key,
        pos: block.position.start.line,
        id: block.id,
        references: new Set(),
        page: file.basename,
        type: "block"
    }))
    const headingsArray = headings && headings.map(header => ({
        key: header.heading,
        pos: header.position.start.line,
        references: new Set(),
        page: file.basename,
        type: "header"
    }))
    const foundItems = findItems({items: [...embeds, ...links], file})
    const listSections = createListSections({sections, listItems})
    if (foundItems) {
        pages.push({
            items: foundItems,
            headings: headingsArray,
            blocks: blocksArray,
            file,
            sections: listSections
        })
    }
    
}




function createListSections({sections, listItems}: CreateListSections): Section[] {
    if (listItems) {
        return sections.map(section => {
            const items: ListItem[]  = []
            if (section.type === "list") {
                listItems.forEach((item)=> {
                    if (item.position.start.line >= section.position.start.line && item.position.start.line <= section.position.end.line) {
                        items.push({pos: item.position.start.line, ...item})
                    }
                })
                const sectionWithItems = {items, ...section}
                return sectionWithItems
            }
            return section
        })
    }
    return sections
}

function buildObjects({pages}:{pages: Page[]}) {
    const allLinks = pages.reduce((acc, page) => {
        acc.push(...page.items)
        return acc
    }, [])
    
    pages.forEach(page => {
        allLinks.forEach(link => {
            page.blocks && page.blocks.forEach(block => {
                if (link.type === "block" && link.id === block.key && link.page === block.page) {
                    block.references.add(link)
                }
               
            })
            page.headings && page.headings.forEach((heading) => {
                if (link.type === "heading" && link.id === heading.key && link.page === heading.page) {
                    heading.references.add(link)
                }
            })
        })  
    })
 
}

function buildLinksAndEmbeds({pages}:{pages: Page[]}) {
    const allRefs = pages.reduce((acc, page) => {
        page.blocks && acc.push(...page.blocks)
        page.headings && acc.push(...page.headings)
        return acc
    }, [])
    pages.forEach(page => {
        page.items && page.items.forEach(item => {
            const ref = allRefs.find(ref => ref.key === item.id && ref.page === item.page)
            item.reference = {...ref, type: "link"}
        })
    })
}

function findItems({items, file}: FindItems) {
    const foundItems: EmbedOrLinkItem[] = []
    if (items) {
        items.forEach(item => {
            const [note, id] = item.link.split("^")
            const pos = item.position.start.line
            const page = note.split("#")[0] ? note.split("#")[0] : file.basename
            const header = item.link.match(/.*#(.*)/)
            const embed = item.original.match(/^!/) ? true : false
            if (id) {
                foundItems.push(
                    {
                        id,
                        pos,
                        page,
                        file,
                        type: "block",
                        embed,
                        reference: {}
                    }
                )
            } 
            if (header && header[1] && !header[1].startsWith("^")) {
                foundItems.push(
                    {
                        id: header[1],
                        pos,
                        page,
                        file,
                        type: "heading",
                        embed,
                        reference: {}
                    }
                )
            }
        })
    }
    return foundItems
}