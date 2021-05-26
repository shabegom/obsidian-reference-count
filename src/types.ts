import { App } from 'obsidian'

import {App, CachedMetaData, TFile} from 'obsidian'

declare module "obsidian" {
  interface App {
      MetadataCache: {
          metadataCache: 
      }
  }
}

export interface CreateButtonElement {
  app: App
  blockRefs: {count: number, files: Set<FileRef>}
  val: HTMLElement
}

export interface CountBlockReferences {
  app: App
  block: BlockCache
  files: TFile[]
}

export interface FileRef {
  file: TFile
  line: number
}

export interface BlockRefs {
  count: number
  files : Set<any>
}

export interface AddBlockReferences {
  app: App
  ctx: MarkdownPostProcessorContext
  val: HTMLElement
}