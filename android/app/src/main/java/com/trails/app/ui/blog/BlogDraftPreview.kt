package com.trails.app.ui.blog

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.trails.app.R
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.data.isUsablePhotoCache
import com.trails.app.ui.documents.DocumentViewerScreen
import com.trails.app.ui.theme.TrailsColors
import java.io.File

internal data class BlogDraftMedia(
    val staged: DraftPhoto?,
    val stagedFile: File?,
    val serverPhotoId: String?,
    val remote: PhotoEntity?,
) {
    val filename: String? get() = staged?.filename ?: remote?.originalFilename
    val mimeType: String? get() = staged?.mimeType ?: remote?.mimeType
    val file: File? get() = stagedFile ?: remote?.takeIf(::isUsablePhotoCache)?.localPath?.let(::File)
}

internal fun EditableBlock.Image.serverPhotoId(staged: DraftPhoto?): String? =
    if (staged == null) photoId else staged.uploadedId

internal fun resolveBlogDraftMedia(
    image: EditableBlock.Image,
    pendingPhotos: Map<String, DraftPhoto>,
    photosById: Map<String, PhotoEntity>,
    localPhoto: (DraftPhoto) -> File?,
): BlogDraftMedia {
    val staged = pendingPhotos[image.id]
    val serverPhotoId = image.serverPhotoId(staged)
    return BlogDraftMedia(staged, staged?.let(localPhoto)?.takeIf(File::isFile), serverPhotoId, photosById[serverPhotoId])
}

@Composable
internal fun BlogDraftPreview(
    state: BlogEditState,
    photosById: Map<String, PhotoEntity>,
    localPhoto: (DraftPhoto) -> File?,
    cachePhoto: suspend (PhotoEntity) -> Unit,
    playback: BlogVideoPlayback,
    onOpenPhoto: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val media = remember(state.blocks, state.pendingPhotos, photosById) {
        state.blocks.flatMap(EditableBlock::photoItems).associate { image ->
            image to resolveBlogDraftMedia(image, state.pendingPhotos, photosById, localPhoto)
        }
    }
    val listNumbers = remember(state.blocks) { blogListNumbers(state.blocks.map { (it as? EditableBlock.Text)?.kind }) }
    var activeVideoIndex by remember { mutableStateOf<Int?>(null) }
    var openPhotoPosition by rememberSaveable { mutableStateOf<IntArray?>(null) }

    fun openPhoto(photo: BlogDraftMedia, blockIndex: Int, photoIndex: Int = 0): (() -> Unit)? {
        val open = when {
            photo.file != null -> ({ openPhotoPosition = intArrayOf(blockIndex, photoIndex) })
            photo.remote != null -> ({ onOpenPhoto(photo.remote.id) })
            else -> return null
        }
        return {
            activeVideoIndex = null
            open()
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column {
                TextButton(onClick = onDismiss, modifier = Modifier.padding(horizontal = 8.dp)) {
                    Text(stringResource(R.string.blog_back_to_editing))
                }
                HorizontalDivider()
                LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp)) {
                    item {
                        BlogReaderHeading(state.title.ifBlank { stringResource(R.string.blog_untitled_default) }, state.startAt)
                    }
                    itemsIndexed(state.blocks) { index, block ->
                        when (block) {
                            is EditableBlock.Text -> BlogReaderText(block.kind, block.runs, listNumbers[index])
                            is EditableBlock.Image -> {
                                val photo = media.getValue(block)
                                val file = photo.file
                                val isVideo = block.isVideo || photo.mimeType?.startsWith("video/") == true
                                if (!isVideo && file == null && photo.remote != null) {
                                    LaunchedEffect(photo.remote.id) { cachePhoto(photo.remote) }
                                }
                                val onOpen = openPhoto(photo, index)
                                val serverPhotoId = state.entryId?.let { photo.serverPhotoId }
                                val label = photo.filename ?: stringResource(R.string.blog_image_unavailable)
                                when {
                                    isVideo && (photo.stagedFile != null || serverPhotoId != null) -> BlogVideo(
                                        photoId = serverPhotoId ?: block.photoId,
                                        photo = photo.remote,
                                        selected = activeVideoIndex == index,
                                        onPlay = { activeVideoIndex = index },
                                        playback = playback,
                                        stagedFile = photo.stagedFile,
                                        filename = photo.filename,
                                    )
                                    photo.staged?.sourceUrl != null && file == null && photo.remote == null -> Text(
                                        stringResource(R.string.blog_image_url_queued),
                                        modifier = Modifier.padding(bottom = 12.dp),
                                        color = TrailsColors.TextSoft,
                                    )
                                    file != null && onOpen != null -> BlogReaderPhoto(file, label, onOpen)
                                    else -> Text(label, modifier = (onOpen?.let { Modifier.clickable(onClick = it) } ?: Modifier).padding(8.dp))
                                }
                            }
                            is EditableBlock.Collage -> BlogReaderCollage(block.photos.size) { photoIndex, modifier, scale ->
                                val image = block.photos[photoIndex]
                                val photo = media.getValue(image)
                                val file = photo.file
                                if (file == null && photo.remote != null) {
                                    LaunchedEffect(photo.remote.id) { cachePhoto(photo.remote) }
                                }
                                CollagePhotoPreview(
                                    file = file,
                                    label = photo.filename ?: stringResource(R.string.blog_collage_photo, photoIndex + 1),
                                    onOpen = openPhoto(photo, index, photoIndex),
                                    modifier = modifier,
                                    contentScale = scale,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    openPhotoPosition?.let { (blockIndex, photoIndex) ->
        val image = state.blocks.getOrNull(blockIndex)?.photoItems()?.getOrNull(photoIndex)
        media[image]?.let { photo ->
            BlogLocalMediaDialog(photo.file, photo.mimeType, photo.filename, onDismiss = { openPhotoPosition = null })
        }
    }
}

@Composable
internal fun BlogLocalMediaDialog(file: File?, mimeType: String?, filename: String?, onDismiss: () -> Unit) {
    if (file != null && mimeType != null && filename != null) {
        Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            DocumentViewerScreen(file.absolutePath, mimeType, filename, onBack = onDismiss)
        }
    }
}
