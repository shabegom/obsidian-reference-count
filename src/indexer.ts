import {
    ListItemCache,
    SectionCache,
} from "obsidian"
import {  ListItem,  Section } from "./types"


let references = {}

export function buildLinksAndReferences(app) {
    console.time('building references')
    const refs = app.fileManager
        .getAllLinkResolutions()
        .reduce((acc, link) => {
            const key = link.reference.link
            if (!acc[key]) {
                acc[key] = []
            }
            if (acc[key]) {
                acc[key].push(link)
            }
            return acc
        }, {})
        references = refs
        console.timeEnd('building references')

}

export function getCurrentPage(file, app) {
    console.time('getting current page')
    const cache = app.metadataCache.getFileCache(file)
    const transformedCache = { ...cache }
    if (cache.blocks) {
        transformedCache.blocks = Object.values(cache.blocks).map((block) => ({
            key: block.id,
            pos: block.position.start.line,
            page: file.basename,
            type: "block",
            references: references[`${file.basename}#^${block.id}`],
        }))
    }
    if (cache.headings) {
        transformedCache.headings = cache.headings.map(
            (header: {
                heading: string
                position: { start: { line: number } }
            }) => ({
                key: header.heading,
                pos: header.position.start.line,

                page: file.basename,
                type: "header",
                references: references[`${file.basename}#${header.heading}`],
            })
        )
    }
    if (cache.sections) {
        transformedCache.sections = createListSections(
            cache.sections,
            cache.listItems
        )
    }
    if (cache.links) {
        transformedCache.links = cache.links.map((link) => {
            link.key = link.link
            link.type = 'link'
            link.pos = link.position.start.line
            link.page = file.basename
            link.references = references[link.link]
            return link
        })
    }
    if (cache.embeds) {
        transformedCache.embeds = cache.embeds.map((embed) => {
            embed.key = embed.link
            embed.page = file.basename
            embed.type = 'link'
            embed.pos = embed.position.start.line
            embed.references = references[embed.link]
            embed.embed = true
            return embed
        })
        transformedCache.links = [
            ...transformedCache.links,
            ...transformedCache.embeds,
        ]
    }
    console.timeEnd('getting current page')
    return transformedCache
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

function createListSections(
    sections: SectionCache[],
    listItems: ListItemCache[]
): Section[] {
    if (listItems) {
        return sections.map((section) => {
            const items: ListItem[] = []
            if (section.type === "list") {
                listItems.forEach((item: ListItem) => {
                    if (
                        item.position.start.line >=
                            section.position.start.line &&
                        item.position.start.line <= section.position.end.line
                    ) {
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


