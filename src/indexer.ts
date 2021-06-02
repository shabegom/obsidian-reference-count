
import { App, BlockCache, EmbedCache, HeadingCache, LinkCache, ListItemCache, SectionCache } from "obsidian"
import { Page, EmbedOrLinkItem, BuildPagesArray, CreateListSections, Section, ListItem, FindItems, Reference } from "./types"

/* global index of pages with associated block references */
let pages: Page[] = []

/**
 * creates a copy of the pages index for use in building block ref buttons
 *
 * @return  {Page[]}  an array of Page objects
 */

export function getPages(): Page[] {
    return [...pages]
}


/**
 * Iterate markdown files in the value and builds the pages index with references using metadataCache. 
 * Completes in ~100ms on a 2000 note vault on first run, and faster on each subsequent run.
 *
 * @param   {App}   app 
 *
 * @return  {void}
 */

export function indexBlockReferences({ app }: { app: App }): void {
    pages = []
    const files = app.vault.getMarkdownFiles()
    let i = 0
    while (i < files.length) {
        const { links, embeds, headings, blocks, sections, listItems } = app.metadataCache.getFileCache(files[i])
        buildPagesArray({ embeds, links, headings, blocks, sections, listItems, file: files[i] })
        i++
    }
    buildObjects({ pages })
    buildLinksAndEmbeds({ pages })
}


/**
 * takes in metadataCache items and associated file and pushes the initial page object into the pages array
 *
 * @param   {EmbedCache}       embeds     embeds from metadataCache
 * @param   {LinkCache}        links      links from metadataCache
 * @param   {HeadingCache}     headings   headings from metadataCache
 * @param   {BlockCache}       blocks     blocks from metadataCache
 * @param   {SectionCache}     sections   sections from metadataCache
 * @param   {ListItemCache}    listItems  listItems from metadataCache
 * @param   {TFile}            file       current file being processed
 *
 * @return  {void}                      
 */
function buildPagesArray({ embeds, links, headings, blocks, sections, listItems, file }: BuildPagesArray): void {
    embeds = embeds ? [...embeds] : []
    links = links ? [...links] : []


    const blocksArray = blocks && Object.values(blocks).map((block) => ({
        key: block.id,
        pos: block.position.start.line,
        page: file.basename,
        type: "block"
    }))

    const headingsArray = headings && headings.map(header => ({
        key: header.heading,
        pos: header.position.start.line,

        page: file.basename,
        type: "header"
    }))
    const foundItems = findItems({ items: [...embeds, ...links], file })
    const listSections = createListSections({ sections, listItems })

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


/**
 * If the section is of type list, add the list items from the metadataCache to the section object. 
 * This makes it easier to iterate a list when building block ref buttons
 *
 * @param   {SectionCache}                sections  
 * @param   {ListItemCache}               listItems  
 *
 * @return  {Section[]}                        Array of sections with additional items key
 */

function createListSections({ sections, listItems }: CreateListSections): Section[] {
    if (listItems) {
        return sections.map(section => {
            const items: ListItem[] = []
            if (section.type === "list") {
                listItems.forEach((item) => {
                    if (item.position.start.line >= section.position.start.line && item.position.start.line <= section.position.end.line) {
                        items.push({ pos: item.position.start.line, ...item })
                    }
                })
                const sectionWithItems = { items, ...section }
                return sectionWithItems
            }
            return section
        })
    }
    return sections
}


/**
 * Go through every link reference and embed in the vault
 * Add a reference to the link or embed on the associated block avoiding duplicates
 * Do the same for headers
 *
 * @param   {Page[]}  pages  Array of pages from global pages index
 *
 * @return  {void}             
 */

function buildObjects({ pages }: { pages: Page[] }) {
    const allLinks = pages.reduce((acc, page) => {
        acc.push(...page.items)
        return acc
    }, [])

    pages.forEach(page => {
        allLinks.forEach(link => {
            page.blocks && page.blocks.forEach(block => {
                if (link.type === "block" && link.id === block.key && link.page === block.page) {

                    const object = { basename: link.file.basename, path: link.file.path, pos: link.pos }
                    if (!isEquivalent(block.references, object)) {
                        block.references = block.references ? block.references : new Set()
                        block.references.add(object)
                    }

                }

            })
            page.headings && page.headings.forEach((heading) => {
                if (link.type === "heading" && cleanHeader(link.id) === cleanHeader(heading.key) && link.page === heading.page) {

                    const object = { basename: link.file.basename, path: link.file.path, pos: link.pos }
                    if (!isEquivalent(heading.references, object)) {
                        heading.references = heading.references ? heading.references : new Set()
                        heading.references.add(object)
                    }


                }
            })
        })
    })

}


/**
 * Go through every block and heading in the vault
 * Add a reference to the block or heading on the associated link
 *
 * @param   {Page[]}  pages  Array of pages from global pages index
 *
 * @return  {void}             
 */

function buildLinksAndEmbeds({ pages }: { pages: Page[] }) {
    const allRefs = pages.reduce((acc, page) => {
        page.blocks && acc.push(...page.blocks)
        page.headings && acc.push(...page.headings)
        return acc
    }, [])
    pages.forEach(page => {
        page.items && page.items.forEach(item => {
            const ref = allRefs.find(ref => {
                if (item.type === "heading") {
                    if (cleanHeader(ref.key) === cleanHeader(item.id) && ref.page === item.page) { return true } else { return false }
                } else {
                    if (ref.key === item.id && ref.page === item.page) { return true } else { return false }
                }
            })
            item.reference = ref && { ...ref, type: "link" }

        })
    })
}


/**
 * Creates an array of block-id links and embeds that exist in the vault
 *
 * @param   {EmbedCache & LinkCache[]}     items  Array of embeds and links
 * @param   {TFile}  file   
 *
 * @return  {[type]}            [return description]
 */

function findItems({ items, file }: FindItems) {
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

                    }
                )
            }
        })
    }
    return foundItems

}

/**
 * Utility function to compare an object to a Set of objects.
 * If the object exists in the array returns true
 *
 * @param   {Set}    Reference  Set of objects to compare
 * @param   {Reference}            object     reference to compare
 *
 * @return  {boolean}             true if object exists in Set
 */
function isEquivalent(set: Set<Reference>, object: Reference) {
    let equiv = false
    set && set.forEach((setObject) => {
        if (setObject.pos === object.pos && setObject.path === object.path) {
            equiv = true
        }
    })
    return equiv
}

export function cleanHeader(header: string) {
    return header.replace(/(\[|\]|#|\*|\(|\))/g, '').replace(/(\|)/g, ' ')
}