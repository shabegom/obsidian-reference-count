import { App, TFile, BlockCache, LinkCache, EmbedCache, SectionCache, ListItemCache, HeadingCache, Pos } from "obsidian"

declare module "obsidian" {
  interface View {
    file: TFile
    previewMode: {renderer: {onRendered: (arg0: unknown) => void, sections: { lineStart: number; lineEnd: number; el: HTMLElement; }[]}}
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
  block: Block | Heading | Record<string, void>
  val: HTMLElement
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
  reference?: Block | Record<string, void>
}

export interface Heading {
          key: string
        pos: number
        references: Set<Record<string, EmbedOrLinkItem>> | Set<unknown>
        page: string
        type: string
}

export interface Block {
         key: string
        pos: number
        id: string
        references: Set<Record<string, EmbedOrLinkItem>> | Set<unknown>
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
}