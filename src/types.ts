import { App, MarkdownPostProcessorContext, TFile, BlockCache, LinkCache, EmbedCache,  } from "obsidian"

export interface AddBlockReferences {
  app: App
  ctx: MarkdownPostProcessorContext
  val: HTMLElement
}

export interface CreateButtonElement {
  app: App
  blockRefs: {count: number, files: Set<FileRef>}
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
}

export interface Index {
  [id: string]: IndexItem
}

export interface EmbedOrLinkItem {
  id: string
  file: TFile
  pos: number
  page: string
}



interface PageItem {
  embeds: EmbedOrLinkItem[]
  links: EmbedOrLinkItem[]
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