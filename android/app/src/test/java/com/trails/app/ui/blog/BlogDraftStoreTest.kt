package com.trails.app.ui.blog

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.trails.app.auth.TokenStore
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class BlogDraftStoreTest {
    @Test
    fun `draft metadata and picked bytes survive together and stay scoped to the account`() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val username = MutableStateFlow<String?>("writer")
        val tokens = mockk<TokenStore> { every { this@mockk.username } returns username }
        val store = BlogDraftStore(context, tokens)
        val scope = store.scopeFor("trip")
        val bytes = byteArrayOf(1, 2, 3)
        val picked = File(context.cacheDir, "picked.jpg").apply { writeBytes(bytes) }
        val photo = store.stage(scope, Uri.fromFile(picked), "picked.jpg")
        picked.delete()

        val draft = DeviceBlogDraft(
            id = "local-draft", entryId = null, title = "Trip", startAt = "2026-11-23",
            blocks = listOf(
                EditableBlock.Text("text", TextBlockKind.PARAGRAPH, listOf(InlineRun("Offline"))),
                EditableBlock.Image("image", "image"),
            ),
            pendingPhotos = mapOf("image" to photo),
            isPrivate = true, isPublished = false,
        )
        val first = store.save(scope, draft)
        val last = store.save(scope, draft.copy(title = "Trip diary"))
        first.await().getOrThrow()
        last.await().getOrThrow()
        val reopened = checkNotNull(store.load(scope, draft.id))
        assertEquals(draft.copy(title = "Trip diary"), reopened)
        assertArrayEquals(bytes, checkNotNull(store.photoFile(scope, reopened.pendingPhotos.getValue("image"))).readBytes())
        assertEquals(listOf(reopened), store.observe("trip").first())
        assertEquals(emptyList<DeviceBlogDraft>(), store.observe("another-trip").first())

        val videoSize = 26L * 1024 * 1024
        val videoSource = File(context.cacheDir, "clip.mp4")
        java.io.RandomAccessFile(videoSource, "rw").use { it.setLength(videoSize) }
        val video = store.stage(scope, Uri.fromFile(videoSource), "clip.mp4")
        assertEquals("video/mp4", video.mimeType)
        assertEquals(videoSize, store.photoFile(scope, video)?.length())
        store.deletePhoto(scope, video)
        videoSource.delete()

        username.value = "another-user"
        assertEquals(emptyList<DeviceBlogDraft>(), store.observe("trip").first())
        store.delete(scope, draft.id)
        store.deletePhoto(scope, photo)
        assertNull(store.load(scope, draft.id))
    }
}
