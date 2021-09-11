import {
    App,
    BlockCache,
    CachedMetadata,
    EmbedCache,
    HeadingCache,
    LinkCache,
    ListItemCache,
    Pos,
    SectionCache,
    TFile,
} from "obsidian";

declare module "obsidian" {
    interface App {
        viewRegistry: {
            getViewCreatorByType: (
                arg0: string
            ) => (arg0: WorkspaceLeaf) => View
        }
        internalPlugins: {
            getPluginById: (arg0: string) => { enabled: boolean }
        }
    }
    interface Workspace {
        getActiveLeafOfViewType: (arg0: unknown) => WorkspaceLeaf
    }

    interface WorkspaceLeaf {
        tabHeaderEl: HTMLElement
        previewMode: {
            renderer: {
                onRendered: (arg0: () => void) => void
            }
        }
    }
    interface View {
        searchQuery: string
        file: TFile
        previewMode: {
            renderer: {
                onRendered: (arg0: unknown) => void
                sections: {
                    lineStart: number
                    lineEnd: number
                    el: HTMLElement
                }[]
            }
        }
    }
}

export interface AddBlockReferences {
    app: App
    val: HTMLElement
    blocks: Block[]
    section: Section
}

export interface CreateButtonElement {
    app: App

    block: Block | Heading
    val: HTMLElement | Element
}

export interface FileRef {
    file?: TFile
    line?: number
    pos?: number
}

interface IndexItemReference {
    file: TFile
    line: number
}

interface IndexItem {
    count: number
    id: string
    file: TFile
    references: Set<IndexItemReference>
    type: string
}

export interface Index {
    [id: string]: IndexItem
}

export interface EmbedOrLinkItem {
    id: string
    pos: number
    file: TFile
    page: string
    type: string
    embed: boolean
    reference?: Block | Heading
}

export interface Heading {
    key: string
    pos: number
    references?: Set<Reference>
    page: string
    type: string
}

export interface Block {
    key: string
    pos: number
    references?: Set<Reference>
    page: string
    type: string
}

export interface ListItem extends ListItemCache {
    pos: number
}

export interface Section {
    id?: string
    items?: ListItem[]
    position: Pos
    pos?: number
    type: string
}

export interface Page {
    items: EmbedOrLinkItem[]
    headings: Heading[]
    blocks: Block[]
    file: TFile
    sections: Section[]
    cache: CachedMetadata
}

export interface BuildIndexObjects {
    blocks: Record<string, BlockCache>
    links: LinkCache[]
    embeds: EmbedCache[]
    file: TFile
}

export interface BuildPagesArray {
    embeds: EmbedCache[]
    links: LinkCache[]
    headings: HeadingCache[]
    blocks: Record<string, BlockCache>
    sections: SectionCache[]
    listItems: ListItemCache[]
    file: TFile
}

export interface CreateListSections {
    sections: SectionCache[]
    listItems: ListItemCache[]
}

export interface FindItems {
    items: EmbedCache[] | LinkCache[]
    file: TFile
}

export interface AddHeaderReferences {
    app: App
    val: HTMLElement
    headings: Heading[]
    section: Section
}

export interface AddLinkReferences {
    app: App
    val: HTMLElement
    links: EmbedOrLinkItem[]
    section: Section
    embedLinks: NodeListOf<Element>
}

export interface Reference {
    basename: string
    path: string
    pos: number
}
