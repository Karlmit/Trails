package com.trails.app.ui.blog

import com.trails.app.R
import com.trails.app.network.apiErrorMessage
import com.trails.app.data.DocumentsRepository
import com.trails.app.data.TimelineRepository
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.dto.BlogPostRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.time.TimeSource
import retrofit2.HttpException
import javax.inject.Inject

internal class BlogPublisher @Inject constructor(
    private val repository: TimelineRepository,
    private val documentsRepository: DocumentsRepository,
    private val draftStore: BlogDraftStore,
) {
    suspend fun run(task: BlogPublishTask) = Attempt(task).publish()

    private inner class Attempt(task: BlogPublishTask) {
        private val tripId = task.key.tripId
        private val routeId = task.key.draftId
        private val draftScope = task.key.scope
        private val _state = task.state

        private suspend fun persist() = withContext(NonCancellable) {
            val state = _state.value
            draftStore.save(draftScope, DeviceBlogDraft(
                routeId, state.entryId, state.title, state.startAt, state.blocks, state.pendingPhotos,
                state.isPrivate, state.isPublished, state.lostFormattingWarning,
            )).await().getOrThrow()
        }

        private fun localPhoto(photo: DraftPhoto) = draftStore.photoFile(draftScope, photo)

        suspend fun publish() {
            val current = _state.value
            val publishContext = kotlin.coroutines.coroutineContext
            var activePhoto: String? = null
            try {
                persist()
                val request = BlogPostRequest(
                    tripId = tripId, title = current.title.trim(), startAt = current.startAt,
                    isPrivate = current.isPrivate,
                )
                val id = current.entryId ?: repository.createBlogPost(request).id.also { createdId ->
                    _state.value = _state.value.copy(entryId = createdId)
                    persist()
                }
                val pending = current.blocks.flatMap { it.photoItems() }.mapNotNull { block ->
                    current.pendingPhotos[block.id]?.takeIf { it.uploadedId == null }?.let { block.id to it }
                }
                val sizes = withContext(Dispatchers.IO) {
                    pending.associate { (id, photo) -> id to (localPhoto(photo)?.length() ?: 0L) }
                }
                var totalBytes = sizes.values.sum()
                var confirmedBytes = 0L
                var completed = 0
                var remainingImports = pending.count { (_, photo) -> photo.sourceUrl != null }
                suspend fun resolvePhoto(block: EditableBlock.Image): EditableBlock.Image {
                    val photo = current.pendingPhotos[block.id] ?: return block
                    val uploadedId = photo.uploadedId ?: run {
                        activePhoto = photo.filename
                        var photoBytes = sizes.getValue(block.id)
                        var initial = BlogUploadProgress(
                            totalPhotos = pending.size,
                            completedPhotos = completed,
                            totalBytes = totalBytes,
                            sentBytes = confirmedBytes,
                            importingUrl = photo.sourceUrl != null,
                        )
                        _state.update { it.copy(uploadProgress = initial) }
                        val hasPendingImports = remainingImports > 0
                        val result = uploadPhoto(id, block.id, photo) { bytesInAttempt ->
                            if (bytesInAttempt != photoBytes) {
                                totalBytes += bytesInAttempt - photoBytes
                                photoBytes = bytesInAttempt
                                initial = initial.copy(totalBytes = totalBytes, retryingSmaller = true)
                                _state.update { it.copy(uploadProgress = initial) }
                            }
                            val attempt = initial
                            val attemptBytes = photoBytes
                            var started = TimeSource.Monotonic.markNow()
                            var resumedBytes = 0L
                            var lastUpdateMillis = -250L
                            val onBytesSent: (Long) -> Unit = { bytes ->
                                if (lastUpdateMillis < 0) {
                                    resumedBytes = bytes
                                    started = TimeSource.Monotonic.markNow()
                                }
                                val elapsedMillis = started.elapsedNow().inWholeMilliseconds
                                if (bytes == 0L || bytes >= attemptBytes || elapsedMillis - lastUpdateMillis >= 250) {
                                    lastUpdateMillis = elapsedMillis
                                    _state.update {
                                        if (publishContext.isActive && it.publishing) {
                                            it.copy(uploadProgress = attempt.sending(attemptBytes, bytes, elapsedMillis, hasPendingImports, resumedBytes))
                                        } else it
                                    }
                                }
                            }
                            onBytesSent
                        }
                        activePhoto = null
                        confirmedBytes += photoBytes
                        completed++
                        if (photo.sourceUrl != null) remainingImports--
                        _state.update {
                            it.copy(uploadProgress = initial.copy(
                                completedPhotos = completed, sentBytes = confirmedBytes, importingUrl = false, retryingSmaller = false,
                            ))
                        }
                        result
                    }
                    return block.copy(photoId = uploadedId)
                }
                val remoteBlocks = current.blocks.map { block ->
                    when (block) {
                        is EditableBlock.Image -> resolvePhoto(block)
                        is EditableBlock.Collage -> block.copy(photos = block.photos.map { resolvePhoto(it) })
                        is EditableBlock.Text -> block
                    }
                }
                repository.updateBlogPost(id, request.copy(description = encodeEditableBlocks(remoteBlocks)), cacheLocally = current.isPublished)
                if (!current.isPublished) repository.publishBlogPost(id)
                withContext(NonCancellable) {
                    _state.value = _state.value.copy(isPublished = true)
                    persist()
                    draftStore.delete(draftScope, routeId)
                    _state.value = _state.value.copy(saved = true)
                    _state.value.pendingPhotos.values.forEach { photo ->
                        runCatching { draftStore.deletePhoto(draftScope, photo) }
                    }
                }
            } catch (failure: CancellationException) {
                _state.update {
                    if (it.saved) it else it.copy(error = BlogEditError.Resource(R.string.blog_error_publish_retry))
                }
                throw failure
            } catch (failure: Exception) {
                _state.value = _state.value.copy(error = publishFailure(failure, activePhoto))
            } finally {
                _state.value = _state.value.copy(saving = false, publishing = false, uploadProgress = null)
            }
        }

        private suspend fun uploadPhoto(
            entryId: String, blockId: String, photo: DraftPhoto, progressFor: (Long) -> (Long) -> Unit,
        ): String {
            val url = photo.sourceUrl
            if (url != null) {
                val uploaded = documentsRepository.importPhotoFromUrl("TIMELINE_ENTRY", entryId, url, cacheLocally = false)
                return confirmUpload(blockId, photo, uploaded, null)
            }

            val file = checkNotNull(localPhoto(photo))
            val mimeType = checkNotNull(photo.mimeType)
            val originalBytes = withContext(Dispatchers.IO) { file.length() }
            val resumed = documentsRepository.resumeBlogPhoto(
                entryId, blockId, file, photo.filename, mimeType, onBytesSent = progressFor(originalBytes),
            )
            if (resumed != null) return confirmUpload(blockId, photo, resumed, file)

            suspend fun send(source: File, name: String, mime: String, bytes: Long): PhotoEntity =
                documentsRepository.uploadStagedPhoto(
                    "TIMELINE_ENTRY", entryId, source, name, mime, isPrivate = false, onBytesSent = progressFor(bytes),
                )

            val uploaded = try {
                send(file, photo.filename, mimeType, originalBytes)
            } catch (failure: HttpException) {
                if (!canRetryWithSmallerPhoto(originalBytes, mimeType, failure.code(), failure.apiErrorMessage())) throw failure
                return withSmallerBlogPhoto(file, photo.filename) { smaller ->
                    val bytes = withContext(Dispatchers.IO) { smaller.file.length() }
                    val resized = send(smaller.file, smaller.filename, smaller.mimeType, bytes)
                    confirmUpload(blockId, photo, resized, smaller.file)
                }
            }
            return confirmUpload(blockId, photo, uploaded, file)
        }

        private suspend fun confirmUpload(blockId: String, photo: DraftPhoto, uploaded: PhotoEntity, file: File?): String {
            val updated = _state.value.pendingPhotos + (blockId to photo.copy(uploadedId = uploaded.id))
            _state.value = _state.value.copy(pendingPhotos = updated)
            persist()
            if (file != null) {
                try {
                    documentsRepository.cacheStagedPhoto(uploaded, file)
                } catch (failure: CancellationException) {
                    throw failure
                } catch (_: Exception) {
                    // The server copy already exists. Trip sync can rebuild its cache.
                }
            }
            return uploaded.id
        }

    }
}
