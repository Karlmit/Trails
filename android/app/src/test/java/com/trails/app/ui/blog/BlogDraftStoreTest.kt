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
        val secondBytes = byteArrayOf(4, 5, 6)
        val secondPicked = File(context.cacheDir, "second.jpg").apply { writeBytes(secondBytes) }
        val secondPhoto = store.stage(scope, Uri.fromFile(secondPicked), "second.jpg")
        secondPicked.delete()

        val draft = DeviceBlogDraft(
            id = "local-draft", entryId = null, title = "Trip", startAt = "2026-11-23",
            blocks = listOf(
                EditableBlock.Text("text", TextBlockKind.PARAGRAPH, listOf(InlineRun("Offline"))),
                EditableBlock.Image("image", "remote-photo"),
                EditableBlock.Collage("wall", listOf(EditableBlock.Image("tile-1", "tile-1"), EditableBlock.Image("tile-2", "tile-2"))),
            ),
            pendingPhotos = mapOf("tile-1" to photo, "tile-2" to secondPhoto),
            isPrivate = true, isPublished = false,
        )
        val first = store.save(scope, draft)
        val last = store.save(scope, draft.copy(title = "Trip diary"))
        first.await().getOrThrow()
        last.await().getOrThrow()
        val reopened = checkNotNull(store.load(scope, draft.id))
        assertEquals(draft.copy(title = "Trip diary"), reopened)
        assertArrayEquals(bytes, checkNotNull(store.photoFile(scope, reopened.pendingPhotos.getValue("tile-1"))).readBytes())
        assertArrayEquals(secondBytes, checkNotNull(store.photoFile(scope, reopened.pendingPhotos.getValue("tile-2"))).readBytes())
        assertEquals(listOf(reopened), store.observe("trip").first())
        assertEquals(emptyList<DeviceBlogDraft>(), store.observe("another-trip").first())

        val largeSize = 26L * 1024 * 1024
        for ((filename, mimeType) in listOf("clip.mp4" to "video/mp4", "photo.jpg" to "image/jpeg")) {
            val source = File(context.cacheDir, filename)
            java.io.RandomAccessFile(source, "rw").use { it.setLength(largeSize) }
            val media = store.stage(scope, Uri.fromFile(source), filename)
            assertEquals(mimeType, media.mimeType)
            assertEquals(largeSize, store.photoFile(scope, media)?.length())
            store.deletePhoto(scope, media)
            source.delete()
        }

        username.value = "another-user"
        assertEquals(emptyList<DeviceBlogDraft>(), store.observe("trip").first())
        store.delete(scope, draft.id)
        store.deletePhoto(scope, photo)
        store.deletePhoto(scope, secondPhoto)
        assertNull(store.load(scope, draft.id))
    }
}
