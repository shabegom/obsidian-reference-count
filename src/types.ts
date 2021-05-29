import { App, MarkdownPostProcessorContext, TFile, BlockCache, LinkCache, EmbedCache, MetadataCache, CachedMetadata, WorkspaceLeaf, View } from "obsidian"

declare module "obsidian" {
  interface View {
    file: TFile
    previewMode: {renderer: {sections: { lineStart: number; lineEnd: number; el: HTMLElement; }[]}}
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
  blockRefs: IndexItem
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



interface PageItem {
  items: EmbedOrLinkItem[]
  file: TFile
}

export interface Pages {
  [id: string]: PageItem
}

export interface BuildIndexObjects {
  blocks: Record<string, BlockCache>
  links: LinkCache[]
  embeds: EmbedCache[]
  file: TFile
}