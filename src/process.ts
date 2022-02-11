import { App, View, Constructor, MarkdownView } from "obsidian";
import { TransformedCache, Section, TransformedCachedItem } from "./types";
import { getCurrentPage } from "./indexer";
import { getSettings } from "./settings";
import { createButtonElements } from "./view";
import BlockRefCounter from "./main";
/**
 * Finds the sections present in a note's Preview, iterates them and adds references if required
 * This duplicates some of the functionality of onMarkdownPostProcessor, but is fired on layout and leaf changes
 * @param   {App}                   app
 * @return  {void}
 */

export function createPreviewView(
    plugin: BlockRefCounter
): { block?: TransformedCachedItem; val?: HTMLElement }[] {
    const buttons: { block?: TransformedCachedItem; val?: HTMLElement }[] = [];
    const app = plugin.app;
    const activeView = app.workspace.getActiveViewOfType(
        MarkdownView as unknown as Constructor<View>
    );
    if (activeView) {
        const page = getCurrentPage({ file: activeView.file, app });
        try {
            activeView.previewMode?.renderer.onRendered(() => {
                // if previewMode exists and has sections, get the sections
                const elements = activeView.previewMode?.renderer?.sections;
                if (page && elements) {
                    elements.forEach(
                        (section: { el: HTMLElement; lineStart: number }) => {
                            const processed = processPage(
                                page,
                                app,
                                section.el,
                                section.lineStart
                            );
                            if (processed.length > 0) {
                                buttons.push(...processed);
                            }
                        }
                    );
                }
            });
            // if previewMode doesn't exist or has no sections, get the whole page
            const el = document.createElement("div");
            const cache = plugin.app.metadataCache.getFileCache(
                activeView.file
            );
            if (cache) {
                const { sections } = cache;
                if (sections) {
                    sections.forEach((section) => {
                        const processed = processPage(
                            page,
                            app,
                            el,
                            section.position.start.line
                        );
                        if (processed.length > 0) {
                            buttons.push(...processed);
                        }
                    });
                }
            }

            return buttons;
        } catch (e) {
            console.log(e);
        }
    }
}

export function processPage(
    page: TransformedCache,
    app: App,
    el: HTMLElement,
    start: number
): { block?: TransformedCachedItem; val?: HTMLElement }[] {
    const buttons: { block?: TransformedCachedItem; val?: HTMLElement }[] = [];
    const settings = getSettings();
    if (page.sections) {
        page.sections.forEach((pageSection: Section) => {
            if (pageSection.position.start.line === start) {
                pageSection.pos = pageSection.position.start.line;
                const type = pageSection?.type;

                // find embeds because their section.type is paragraph but they need to be processed differently
                const embeds = el.querySelectorAll(".internal-embed");
                const hasEmbed = embeds.length > 0 ? true : false;
                if (
                    settings.displayParent &&
                    settings.displayBlocks &&
                    page.blocks &&
                    !hasEmbed &&
                    (type === "paragraph" ||
                        type === "list" ||
                        type === "blockquote" ||
                        type === "code")
                ) {
                    const blockButtons = addBlockReferences(
                        el,
                        page.blocks,
                        pageSection
                    );
                    buttons.push(...blockButtons);
                }
                if (
                    settings.displayParent &&
                    settings.displayHeadings &&
                    page.headings &&
                    type === "heading"
                ) {
                    const headerButtons = addHeaderReferences(
                        el,
                        page.headings,
                        pageSection
                    );
                    buttons.push(...headerButtons);
                }
                if (
                    settings.displayChild &&
                    settings.displayLinks &&
                    page.links
                ) {
                    const linkButtons = addLinkReferences(
                        el,
                        page.links,
                        pageSection
                    );
                    buttons.push(...linkButtons);
                }
                if (
                    settings.displayChild &&
                    settings.displayEmbeds &&
                    page.embeds
                ) {
                    const embedButtons = addEmbedReferences(
                        el,
                        page.embeds,
                        pageSection
                    );
                    buttons.push(...embedButtons);
                }
            }
        });
        if (buttons.length > 0) {
            createButtonElements(app, buttons);
        }
        return buttons;
    }
}

/**
 * Iterate through the blocks in the note and add a block ref button if the section includes a block-id
 *
 *
 * @param   {App}                      app
 * @param   {HTMLElement}              val      the HTMLElement to attach the button to
 * @param   {Block[]}                  blocks   Array of blocks from pages index
 * @param   {Section}                  section  Section object from pages index
 *
 * @return  {void}
 */
function addBlockReferences(
    val: HTMLElement,
    blocks: TransformedCache["headings"],
    section: Section
): { block?: TransformedCachedItem; val?: HTMLElement }[] {
    const blockButtons: { block: TransformedCachedItem; val: HTMLElement }[] =
        [];
    if (section.id || section.items) {
        blocks &&
            blocks.forEach((block) => {
                if (block.key === section.id) {
                    if (section.type === "paragraph") {
                        blockButtons.push({ block, val });
                    }

                    if (
                        section.type === "blockquote" ||
                        section.type === "code"
                    ) {
                        blockButtons.push({ block, val });
                    }
                }

                // Iterate each list item and add the button to items with block-ids

                if (section.type === "list") {
                    section.items.forEach((item) => {
                        if (item.id === block.key) {
                            block.type = "block-list";
                            blockButtons.push({
                                block,
                                val: document.createElement("div"),
                            });
                        }
                    });
                }
            });
    }
    return blockButtons;
}

function addEmbedReferences(
    val: HTMLElement,
    embeds: TransformedCache["embeds"],
    section: Section
): { block?: TransformedCachedItem; val?: HTMLElement }[] {
    const embedButtons: { block: TransformedCachedItem; val: HTMLElement }[] =
        [];
    embeds.forEach((embed) => {
        if (section.pos === embed.pos.start.line) {
            if (section.type === "paragraph") {
                embedButtons.push({ block: embed, val });
            }

            if (section.type === "blockquote" || section.type === "code") {
                embedButtons.push({ block: embed, val });
            }
        }

        // Iterate each list item and add the button to items with block-ids

        if (section.type === "list") {
            section.items.forEach((item) => {
                if (
                    item.key === embed.key &&
                    item.position.start.line === embed.pos.start.line
                ) {
                    embed.type = "link-list";
                    embedButtons.push({
                        block: embed,
                        val: document.createElement("div"),
                    });
                }
            });
        }
    });
    return embedButtons;
}

/**
 * Iterate through links (includes transcluded embeds) and add a block ref button if the link has an associated block ref
 *
 * @param   {App}                     app
 * @param   {HTMLElement}             val        HTMLElement to attach the button to
 * @param   {EmbedOrLinkItem[]}       links      Array of links and embeds from pages index
 * @param   {Section}                 section    Section object from pages index
 *
 * @return  {void}
 */
function addLinkReferences(
    val: HTMLElement,
    links: TransformedCachedItem[],
    section: Section
): { block?: TransformedCachedItem; val?: HTMLElement }[] {
    const linkButtons: { block?: TransformedCachedItem; val: HTMLElement }[] =
        [];
    links.forEach((link) => {
        if (
            section.type === "paragraph" &&
            section.pos === link.pos.start.line
        ) {
            linkButtons.push({ block: link, val });
        }
        // Have to iterate list items so the button gets attached to the right element
        if (section.type === "list") {
            section.items.forEach((item, index: number) => {
                const buttons = val.querySelectorAll("li");
                if (item.pos === link.pos.start.line) {
                    link.type = "link-list";
                    linkButtons.push({ block: link, val: buttons[index] });
                }
            });
        }
    });
    return linkButtons;
}

/**
 * Adds a block ref button to each header that has an associated header link or embed
 *
 * @param   {App}               app
 * @param   {HTMLElement}       val       HTMLElement to attach the button to
 * @param   {Heading[]}         headings  Array of heading objects from pages index
 * @param   {Section}           section   Section object from pages index
 *
 * @return  {void}
 */

function addHeaderReferences(
    val: HTMLElement,
    headings: TransformedCachedItem[],
    section: Section
): { block?: TransformedCachedItem; val: HTMLElement }[] {
    const headerButtons: { block?: TransformedCachedItem; val: HTMLElement }[] =
        [];
    if (headings) {
        headings.forEach((header: TransformedCachedItem) => {
            header.pos.start.line === section.pos &&
                headerButtons.push({ block: header, val });
        });
    }
    return headerButtons;
}
