import {
    App,
    ListItemCache,
    SectionCache,
    stripHeading,
    TFile,
} from "obsidian";
import { Link, ListItem, Section, TransformedCache } from "./types";

let references: { [x: string]: Link[] };

export function buildLinksAndReferences(app: App): void {
    const refs = app.fileManager
        .getAllLinkResolutions()
        .reduce(
            (
                acc: { [x: string]: Link[] },
                link: Link
            ): { [x: string]: Link[] } => {
                const key = link.reference.link;
                if (!acc[key]) {
                    acc[key] = [];
                }
                if (acc[key]) {
                    acc[key].push(link);
                }
                return acc;
            },
            {}
        );
    references = refs;
}

export function getCurrentPage({
    file,
    app,
}: {
    file: TFile;
    app: App;
}): TransformedCache {
    const cache = app.metadataCache.getFileCache(file);
    const transformedCache: TransformedCache = {};
    if (cache.blocks) {
        transformedCache.blocks = Object.values(cache.blocks).map((block) => ({
            key: block.id,
            pos: block.position.start.line,
            page: file.basename,
            type: "block",
            references: references[`${file.basename}#^${block.id}`],
        }));
    }
    if (cache.headings) {
        transformedCache.headings = cache.headings.map(
            (header: {
                heading: string;
                position: { start: { line: number } };
            }) => ({
                original: header.heading,
                key: stripHeading(header.heading),
                pos: header.position.start.line,

                page: file.basename,
                type: "header",
                references:
                    references[
                        `${file.basename}#${stripHeading(header.heading)}`
                    ],
            })
        );
    }
    if (cache.sections) {
        transformedCache.sections = createListSections(
            cache.sections,
            cache.listItems
        );
    }
    if (cache.links) {
        transformedCache.links = cache.links.map((link) => ({
            key: link.link,
            type: "link",
            pos: link.position.start.line,
            page: file.basename,
            references: references[link.link],
        }));
        if (transformedCache.links) {
            transformedCache.links = transformedCache.links.map((link) => {
                if (
                    link.key.includes("#") &&
                    !link.key.includes("#^") &&
                    transformedCache.headings
                ) {
                    transformedCache.headings.forEach((header) => {
                        if (
                            stripHeading(header.key) ===
                            stripHeading(link.key.split("#")[1])
                        ) {
                            link.original = header.original;
                        }
                    });
                }
                return link;
            });
        }
    }
    if (cache.embeds) {
        transformedCache.embeds = cache.embeds.map((embed) => ({
            key: embed.link,
            page: file.basename,
            type: "link",
            pos: embed.position.start.line,
            references: references[embed.link],
        }));
        if (transformedCache.embeds) {
            transformedCache.embeds = transformedCache.embeds.map((embed) => {
                if (
                    embed.key.includes("#") &&
                    !embed.key.includes("#^") &&
                    transformedCache.headings
                ) {
                    transformedCache.headings.forEach((header) => {
                        if (
                            stripHeading(header.key) ===
                            stripHeading(embed.key.split("#")[1])
                        ) {
                            embed.original = header.original;
                        }
                    });
                }
                return embed;
            });
        }
    }
    return transformedCache;
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
            const items: ListItem[] = [];
            if (section.type === "list") {
                listItems.forEach((item: ListItem) => {
                    if (
                        item.position.start.line >=
                            section.position.start.line &&
                        item.position.start.line <= section.position.end.line
                    ) {
                        items.push({ pos: item.position.start.line, ...item });
                    }
                });
                const sectionWithItems = { items, ...section };
                return sectionWithItems;
            }
            return section;
        });
    }

    return sections;
}
