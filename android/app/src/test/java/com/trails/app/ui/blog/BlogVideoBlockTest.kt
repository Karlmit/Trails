package com.trails.app.ui.blog

import com.trails.app.ui.documents.DocumentPreviewType
import com.trails.app.ui.documents.documentPreviewType
import org.junit.Assert.assertEquals
import org.junit.Test

class BlogVideoBlockTest {
    @Test fun `keeps video and photo blocks in order through the server payload`() {
        val blocks = listOf(EditableBlock.Image("video", "video-id", true), EditableBlock.Image("image", "photo-id"))
        val json = encodeEditableBlocks(blocks)
        assertEquals(blocks, parseEditableBlocks(json).blocks)
        assertEquals(listOf(BlogBlock.ImageBlock("video-id", true), BlogBlock.ImageBlock("photo-id")), parseBlogBlocks(json))
        assertEquals(DocumentPreviewType.VIDEO, documentPreviewType("video/mp4", "clip.mp4"))
    }
    @Test fun `reads a standard video block saved by the web editor`() {
        val json = """[{"id":"block","type":"video","props":{"url":"/api/v1/photos/clip/file"}}]"""
        assertEquals(listOf(EditableBlock.Image("block", "clip", true)), parseEditableBlocks(json).blocks)
        assertEquals(listOf(BlogBlock.ImageBlock("clip", true)), parseBlogBlocks(json))
    }
}
