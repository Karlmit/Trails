package com.trails.app.ui.blog

import org.junit.Assert.assertEquals
import org.junit.Test

class BlogCollageTest {
    private val one = EditableBlock.Image("tile-one", "one")
    private val two = EditableBlock.Image("tile-two", "two")

    @Test
    fun `persists a collage as ordered ordinary photo blocks for older readers`() {
        val collage = EditableBlock.Collage("group", listOf(one, two))
        val video = EditableBlock.Image("video", "clip", isVideo = true)
        val payload = encodeEditableBlocks(listOf(collage, video))

        assertEquals(listOf(collage, video), parseEditableBlocks(payload).blocks)
        assertEquals(listOf(BlogBlock.CollageBlock(listOf("one", "two")), BlogBlock.ImageBlock("clip", true)), parseBlogBlocks(payload))
        assertEquals(
            listOf(BlogBlock.ImageBlock("one"), BlogBlock.ImageBlock("two"), BlogBlock.ImageBlock("clip", true)),
            parseBlogBlocks(payload.replace(",\"collage\":true", "")),
        )
    }

    @Test
    fun `keeps empty and singleton collages in the editor and shows ordinary photos in the reader`() {
        val blocks = listOf(EditableBlock.Collage("empty", emptyList()), EditableBlock.Collage("one", listOf(one)))
        val payload = encodeEditableBlocks(blocks)

        assertEquals(blocks, parseEditableBlocks(payload).blocks)
        assertEquals(listOf(BlogBlock.CollageBlock(listOf("one"))), parseBlogBlocks(payload))
    }

    @Test
    fun `falls back to visiting mixed media and nested content`() {
        val payload = """
            [{"id":"group","type":"layoutImage","props":{"collage":true},"children":[
                {"id":"tile-one","type":"layoutImage","props":{"url":"/api/v1/photos/one/file"},"children":[
                    {"id":"nested","type":"paragraph","content":"Nested"}
                ]},
                {"id":"video","type":"layoutImage","props":{"url":"/api/v1/photos/clip/file","mediaKind":"video"}}
            ]}]
        """.trimIndent()

        assertEquals(
            listOf(one, EditableBlock.Text("nested", TextBlockKind.PARAGRAPH, listOf(InlineRun("Nested"))),
                EditableBlock.Image("video", "clip", isVideo = true)),
            parseEditableBlocks(payload).blocks,
        )
        assertEquals(
            listOf(BlogBlock.ImageBlock("one"), BlogBlock.TextBlock(listOf(InlineRun("Nested"))), BlogBlock.ImageBlock("clip", true)),
            parseBlogBlocks(payload),
        )
    }

    @Test
    fun `uses the same ordered row sizes as web up to the picker capacity`() {
        assertEquals(
            listOf(listOf(1), listOf(1, 1), listOf(1, 2), listOf(2, 2), listOf(2, 3), listOf(2, 2, 2),
                listOf(2, 2, 3), listOf(2, 3, 3), listOf(3, 3, 3)),
            (1..MAX_COLLAGE_PHOTOS).map(::photoCollageRows),
        )
        assertEquals(emptyList<Int>(), photoCollageRows(0))
        assertEquals(emptyList<Int>(), photoCollageRows(MAX_COLLAGE_PHOTOS + 1))
    }
}
