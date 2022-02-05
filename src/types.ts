import {
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
    interface FileManager {
        getAllLinkResolutions: () => Link[]
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
        currentMode: {
            type: string
        }
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
    interface MetadataCache {
        metadataCache: {
            [x: string]: CachedMetadata
        }
        getLinks: () => {
            [key: string]: {
                link: string
                position: Pos
            }
        }
    }
}

export interface Link {
    reference: {
        link: string
        displayText: string
        position: Pos
    }
    resolvedFile: TFile
    resolvedPaths: string[]
    sourceFile: TFile
}


export interface TransformedCachedItem {
    key: string
    pos: Pos
    page: string
    type: string
    references: Link[]
    original?: string
}

export interface TransformedCache {
    blocks?: TransformedCachedItem[]
    links?: TransformedCachedItem[]
    headings?: TransformedCachedItem[]
    embeds?: TransformedCachedItem[]
    sections?: SectionCache[]
}


export interface ListItem extends ListItemCache {
    pos: number
    key: string
}

export interface Section {
    id?: string
    items?: ListItem[]
    position: Pos
    pos?: number
    type: string
}
