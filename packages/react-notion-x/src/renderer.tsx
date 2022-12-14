import * as React from 'react'

import mediumZoom from '@fisch0920/medium-zoom'
import { Block as BlockType, ExtendedRecordMap } from 'notion-types'
import { v4 as uuidv4 } from 'uuid'

import { Block } from './block'
import { NotionContextProvider, useNotionContext } from './context'
import {
  MapImageUrlFn,
  MapPageUrlFn,
  NotionComponents,
  SearchNotionFn
} from './types'

export const NotionRenderer: React.FC<{
  recordMap: ExtendedRecordMap
  components?: Partial<NotionComponents>

  mapPageUrl?: MapPageUrlFn
  mapImageUrl?: MapImageUrlFn
  searchNotion?: SearchNotionFn

  rootPageId?: string
  rootDomain?: string

  // set fullPage to false to render page content only
  // this will remove the header, cover image, and footer
  fullPage?: boolean

  darkMode?: boolean
  previewImages?: boolean
  forceCustomImages?: boolean
  showCollectionViewDropdown?: boolean
  linkTableTitleProperties?: boolean

  showTableOfContents?: boolean
  minTableOfContentsItems?: number

  defaultPageIcon?: string
  defaultPageCover?: string
  defaultPageCoverPosition?: number

  className?: string
  bodyClassName?: string

  header?: React.ReactNode
  footer?: React.ReactNode
  pageHeader?: React.ReactNode
  pageFooter?: React.ReactNode
  pageTitle?: React.ReactNode
  pageAside?: React.ReactNode
  pageCover?: React.ReactNode

  blockId?: string
  hideBlockId?: boolean
  disableHeader?: boolean

  author?: any
}> = ({
  components,
  recordMap,
  mapPageUrl,
  mapImageUrl,
  searchNotion,
  fullPage,
  rootPageId,
  rootDomain,
  darkMode,
  previewImages,
  forceCustomImages,
  showCollectionViewDropdown,
  linkTableTitleProperties,
  showTableOfContents,
  minTableOfContentsItems,
  defaultPageIcon,
  defaultPageCover,
  defaultPageCoverPosition,
  author,
  ...rest
}) => {
  const zoom = React.useMemo(
    () =>
      typeof window !== 'undefined' &&
      mediumZoom({
        background: 'rgba(0, 0, 0, 0.8)',
        minZoomScale: 2.0,
        margin: getMediumZoomMargin()
      }),
    []
  )

  const wrappedRecordMap = structuredClone(recordMap)

  let firstKey = ''

  for (const prop in wrappedRecordMap.block) {
    firstKey = prop
    break
  }

  // take the main block .value.content (array of block ids)
  const origContentArray = wrappedRecordMap.block[firstKey].value.content
  wrappedRecordMap.block[firstKey].value.content = []

  // state of loop
  let inAList = false
  let listType = ''
  let newParentUUID = ''

  // for each item
  for (const i in origContentArray) {
    const currentItemKey = origContentArray[i]
    const currentItemObj = wrappedRecordMap.block[currentItemKey]

    // if it is a list_item
    if (
      currentItemObj.value.type === 'numbered_list' ||
      currentItemObj.value.type === 'bulleted_list'
    ) {
      // first time? create a new block wrapper_numbered_list with custom ID
      if (!inAList || listType !== currentItemObj.value.type) {
        newParentUUID = uuidv4()

        const newBlock = structuredClone(currentItemObj)
        newBlock.value.id = newParentUUID
        newBlock.value.type = 'wrapper_' + currentItemObj.value.type
        newBlock.value.properties = {}
        newBlock.value.content = []

        wrappedRecordMap.block[newBlock.value.id] = newBlock

        // add the custom ID to wrapped new .value.content
        wrappedRecordMap.block[firstKey].value.content.push(newBlock.value.id)
      }

      // set state machine 'in a list' = true
      inAList = true
      listType = currentItemObj.value.type

      // if 'in a list', change the .value.parent_id (incl. for the first one)
      if (inAList && currentItemObj.value.parent_id === firstKey) {
        currentItemObj.value.parent_id = newParentUUID
        wrappedRecordMap.block[newParentUUID].value.content.push(currentItemKey)
      }
    } else {
      // set 'in a list' to false
      inAList = false
      newParentUUID = ''
      // add the id to the wrapped new .value.content
      wrappedRecordMap.block[firstKey].value.content.push(currentItemKey)
    }

    // Notion adds an empty text block at the end of the content, remove it
    if (
      +i === origContentArray.length - 1 &&
      currentItemObj.value.type === 'text' &&
      !currentItemObj.properties &&
      !currentItemObj.content?.length
    ) {
      wrappedRecordMap.block[firstKey].value.content.splice(-1, 1)
    }
  }

  return (
    <NotionContextProvider
      components={components}
      recordMap={wrappedRecordMap}
      mapPageUrl={mapPageUrl}
      mapImageUrl={mapImageUrl}
      searchNotion={searchNotion}
      fullPage={fullPage}
      rootPageId={rootPageId}
      rootDomain={rootDomain}
      darkMode={darkMode}
      previewImages={previewImages}
      forceCustomImages={forceCustomImages}
      showCollectionViewDropdown={showCollectionViewDropdown}
      linkTableTitleProperties={linkTableTitleProperties}
      showTableOfContents={showTableOfContents}
      minTableOfContentsItems={minTableOfContentsItems}
      defaultPageIcon={defaultPageIcon}
      defaultPageCover={defaultPageCover}
      defaultPageCoverPosition={defaultPageCoverPosition}
      zoom={zoom}
    >
      <NotionBlockRenderer author={author} {...rest} />
    </NotionContextProvider>
  )
}

export const NotionBlockRenderer: React.FC<{
  className?: string
  bodyClassName?: string
  header?: React.ReactNode
  footer?: React.ReactNode
  disableHeader?: boolean

  blockId?: string
  hideBlockId?: boolean
  level?: number

  author?: any
}> = ({ level = 0, blockId, ...props }) => {
  const { recordMap } = useNotionContext()
  const id = blockId || Object.keys(recordMap.block)[0]
  const block = recordMap.block[id]?.value

  if (!block) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('missing block', blockId)
    }

    return null
  }

  return (
    <Block key={id} level={level} block={block} {...props}>
      <BlockChildrenRenderer level={level} block={block} {...props} />
    </Block>
  )
}

const BlockChildrenRenderer: React.FC<{
  className?: string
  bodyClassName?: string
  header?: React.ReactNode
  footer?: React.ReactNode
  disableHeader?: boolean

  block: BlockType
  hideBlockId?: boolean
  level?: number

  author?: any
}> = ({ level, block, ...props }) => {
  const { recordMap } = useNotionContext()
  const contentNodes = []

  if (!block.content) {
    return <></>
  }

  const wrapSection = (nextChildId, content: React.ReactElement[]) => {
    return <section key={nextChildId}>{content}</section>
  }

  for (let i = 0; i < block.content.length; ) {
    const nextChildBlock = recordMap.block[block.content[i]]?.value
    const nextChildBlockType = nextChildBlock?.type

    let nextChildGroup = [block.content[i]]

    if (nextChildBlockType === 'header') {
      let j = i + 1
      while (
        j < block.content.length &&
        recordMap.block[block.content[j]]?.value?.type !== 'header'
      ) {
        j++
      }
      nextChildGroup = block.content.slice(i, j)
    }

    const nextRenderedGroup = nextChildGroup.map((nextChildId) => (
      <NotionBlockRenderer
        key={nextChildId}
        blockId={nextChildId}
        level={level + 1}
        {...props}
      />
    ))

    if (nextChildBlockType === 'header') {
      contentNodes.push(wrapSection(nextChildBlock.id, nextRenderedGroup))
    } else {
      contentNodes.push(...nextRenderedGroup)
    }

    i += nextChildGroup.length
  }

  return <>{contentNodes}</>
}

function getMediumZoomMargin() {
  const width = window.innerWidth

  if (width < 500) {
    return 8
  } else if (width < 800) {
    return 20
  } else if (width < 1280) {
    return 30
  } else if (width < 1600) {
    return 40
  } else if (width < 1920) {
    return 48
  } else {
    return 72
  }
}
