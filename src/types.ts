import { App, MarkdownPostProcessorContext, TFile, BlockCache, LinkCache, EmbedCache, MetadataCache, CachedMetadata, WorkspaceLeaf, SectionCache, View, ListItemCache, HeadingCache } from "obsidian"

declare module "obsidian" {
  interface View {
    file: TFile
    previewMode: {renderer: {onRendered: () => void, sections: { lineStart: number; lineEnd: number; el: HTMLElement; }[]}}
  }
}

export interface AddBlockReferences {
  app: App
  ctx: MarkdownPostProcessorContext | { sourcePath: string, getSectionInfo: (val: HTMLElement) => void }
  val: HTMLElement
  mdCache: CachedMetadata
  listSections: any
  actView: View
  blockRefs: Index
}

export interface CreateButtonElement {
  app: App
  block: BlockObject
  val: HTMLElement
}


export interface FileRef {
  file: TFile
  line: number
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
}

interface Heading {
          key: string
        pos: number
        references: Set<any>
        page: string
        type: string
}

interface Block {
         key: string
        pos: number
        id: string
        references: Set<any>
        page: string
        type: string
}

interface ListItem extends ListItemCache {
  pos: number
}

interface Section extends SectionCache {
  items: ListItem[]
}

export interface Page {
     items: EmbedOrLinkItem[]
     headings: Heading[]
     blocks: Block[]
     file: TFile
     sections: Section[]
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