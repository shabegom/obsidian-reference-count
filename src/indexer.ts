
import { App, CachedMetadata, EmbedCache, Events, LinkCache, ListItemCache, SectionCache, TFile, parseLinktext } from "obsidian"
import { Page, EmbedOrLinkItem, Section, ListItem, Reference } from "./types"

// global index of pages with associated block references
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

export function indexBlockReferences(app: App): void {
    console.time("indexing")
    pages = []
    const files = app.vault.getMarkdownFiles()
    for (const file of files) {
        const cache = app.metadataCache.getFileCache(file)
        if (cache) {
            buildPagesArray(file, cache)
        }

    }

    buildObjects(pages)
    buildLinksAndEmbeds(pages)
    console.timeEnd('indexing')
}


/**
 * takes in metadataCache items and associated file and pushes the initial page object into the pages array
 *
 * @param   {EmbedCache[]}       embeds     embeds from metadataCache
 * @param   {LinkCache[]}        links      links from metadataCache
 * @param   {HeadingCache[]}     headings   headings from metadataCache
 * @param   {Record<string,BlockCache>}       blocks     blocks from metadataCache
 * @param   {SectionCache[]}     sections   sections from metadataCache
 * @param   {ListItemCache[]}    listItems  listItems from metadataCache
 * @param   {TFile}            file       current file being processed
 *
 * @return  {void}                      
 */
function buildPagesArray( file: TFile, cache: CachedMetadata): void {
    const {embeds = [], links = [], headings, blocks, sections, listItems} = cache
    const blocksArray = blocks && Object.values(blocks).map((block) => ({
        key: block.id,
        pos: block.position.start.line,
        page: file.basename,
        type: "block"
    }))

    const headingsArray = headings && headings.map((header: { heading: any; position: { start: { line: any } } }) => ({
        key: header.heading,
        pos: header.position.start.line,

        page: file.basename,
        type: "header"
    }))
    const foundItems = findItems([...embeds, ...links], file)
    const listSections = createListSections(sections, listItems)

    if (foundItems) {
        pages.push({
            items: foundItems,
            headings: headingsArray,
            blocks: blocksArray,
            file,
            sections: listSections,
            cache
        })
    }
}


/**
 * If the section is of type list, add the list items from the metadataCache to the section object. 
 * This makes it easier to iterate a list when building block ref buttons
 *
 * @param   {SectionCache[]}                sections  
 * @param   {ListItemCache[]}               listItems  
 *
 * @return  {Section[]}                        Array of sections with additional items key
 */

function createListSections(sections: SectionCache[], listItems: ListItemCache[]): Section[] {

    if (listItems) {
        return sections.map((section) => {
            const items: ListItem[] = []
            if (section.type === "list") {
                listItems.forEach((item: ListItem) => {
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

function buildObjects(): void {
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
                const needsCleaning = heading.key.match(/[^\w\s-]/g)
                if (needsCleaning) {
                    heading.key = cleanHeader(heading.key)
                }
                if (link.type === "heading" && link.id === heading.key && link.page === heading.page) {

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

function buildLinksAndEmbeds(pages: Page[]): void {
    const allRefs = pages.reduce((acc, page) => {
        page.blocks && acc.push(...page.blocks)
        page.headings && acc.push(...page.headings)
        return acc
    }, [])
    pages.forEach(page => {
        page.items && page.items.forEach(item => {
            const ref = allRefs.find(ref => {
                if (item.type === "heading") {
                    const needsCleaning = ref.key.match(/[^\w\s-]/g)
                    if (needsCleaning) {
                        ref.key = cleanHeader(ref.key)
                    }
                    if (ref.key === item.id && ref.page === item.page) { return true } else { return false }
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
 * @param   {EmbedCache[] & LinkCache[]}     items  Array of embeds and links
 * @param   {TFile}  file   
 *
 * @return  {EmbedOrLinkItem[]}            
 */

function findItems(items: EmbedCache[] | LinkCache[], file: TFile): EmbedOrLinkItem[] {

    const foundItems: EmbedOrLinkItem[] = []
    if (items) {
        items.forEach((item) => {
            const [note, id] = item.link.split("^")
            const pos = item.position.start.line
            const page = parseLinktext(note).path
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
function isEquivalent(set: Set<Reference>, object: Reference): boolean {
    let equiv = false
    set && set.forEach((setObject) => {
        if (setObject.pos === object.pos && setObject.path === object.path) {
            equiv = true
        }
    })
    return equiv
}

export function cleanHeader(header: string): string {
    return header.replace(/[(|^\s)(.^\s)]/g, " ").replace(/[^\w\s-]/g, "")
}
