package com.trails.app.data

import android.net.Uri
import com.trails.app.data.dao.AttachmentDao
import com.trails.app.data.dao.PhotoDao
import com.trails.app.data.entity.AttachmentEntity
import com.trails.app.data.entity.PhotoEntity
import com.trails.app.network.TrailsApiService
import kotlinx.coroutines.flow.Flow
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

private fun String.toPlainRequestBody() = toRequestBody("text/plain".toMediaTypeOrNull())

@Singleton
class DocumentsRepository @Inject constructor(
    private val api: TrailsApiService,
    private val attachmentDao: AttachmentDao,
    private val photoDao: PhotoDao,
    private val fileCacheManager: FileCacheManager,
) {
    fun observeAttachmentsForTrip(tripId: String): Flow<List<AttachmentEntity>> = attachmentDao.observeForTrip(tripId)

    fun observeAttachmentsForOwner(ownerType: String, ownerId: String): Flow<List<AttachmentEntity>> =
        attachmentDao.observeForOwner(ownerType, ownerId)

    fun observePhotosForOwner(ownerType: String, ownerId: String): Flow<List<PhotoEntity>> =
        photoDao.observeForOwner(ownerType, ownerId)

    fun observePhotosForTrip(tripId: String): Flow<List<PhotoEntity>> = photoDao.observeForTrip(tripId)

    /** Retries caching one file on demand (e.g. the bulk sync pass failed for it) -- returns the local path on success. */
    suspend fun ensureAttachmentCached(attachment: AttachmentEntity): String? {
        if (attachment.localPath != null) return attachment.localPath
        return runCatching { fileCacheManager.downloadAttachment(attachment) }
            .onSuccess { attachmentDao.setLocalPath(attachment.id, it) }
            .getOrNull()
    }

    suspend fun ensurePhotoCached(photo: PhotoEntity): String? {
        if (photo.localPath != null) return photo.localPath
        return runCatching { fileCacheManager.downloadPhoto(photo) }
            .onSuccess { photoDao.setLocalPath(photo.id, it) }
            .getOrNull()
    }

    /** Uploads a picked file as an Attachment, then caches its metadata (and the just-uploaded bytes) locally. */
    suspend fun uploadAttachment(tripId: String, ownerType: String, ownerId: String, uri: Uri, filename: String): AttachmentEntity {
        val part = fileCacheManager.prepareUploadPart(uri, "file", filename)
        val created = api.uploadAttachment(ownerType.toPlainRequestBody(), ownerId.toPlainRequestBody(), part)
        val entity = created.toEntity()
        attachmentDao.upsertAll(listOf(entity))
        val localPath = runCatching { fileCacheManager.downloadAttachment(entity) }.getOrNull()
        if (localPath != null) attachmentDao.setLocalPath(entity.id, localPath)
        return entity
    }

    suspend fun deleteAttachment(attachmentId: String) {
        api.deleteAttachment(attachmentId)
        attachmentDao.deleteById(attachmentId)
    }

    suspend fun uploadPhoto(
        ownerType: String,
        ownerId: String,
        uri: Uri,
        filename: String,
        isPrivate: Boolean = false,
    ): PhotoEntity {
        val part = fileCacheManager.prepareUploadPart(uri, "file", filename)
        val created = api.uploadPhoto(
            ownerType.toPlainRequestBody(),
            ownerId.toPlainRequestBody(),
            part,
            isPrivate.toString().toPlainRequestBody(),
        )
        val entity = created.toEntity()
        photoDao.upsertAll(listOf(entity))
        val localPath = runCatching { fileCacheManager.downloadPhoto(entity) }.getOrNull()
        if (localPath != null) photoDao.setLocalPath(entity.id, localPath)
        return entity
    }

    suspend fun deletePhoto(photoId: String) {
        api.deletePhoto(photoId)
        photoDao.deleteById(photoId)
    }

    suspend fun markPhotoPrimary(photoId: String): PhotoEntity {
        val updated = api.markPhotoPrimary(photoId)
        val existingPath = photoDao.getAllForTrip(updated.tripId).find { it.id == photoId }?.localPath
        val entity = updated.toEntity(localPath = existingPath)
        photoDao.upsertAll(listOf(entity))
        return entity
    }

    /** Syncs Attachment/Photo metadata for a trip, then downloads any bytes not already cached. */
    suspend fun syncTrip(tripId: String) {
        syncAttachmentMetadata(tripId)
        syncPhotoMetadata(tripId)
        cacheMissingFiles(tripId)
    }

    private suspend fun syncAttachmentMetadata(tripId: String) {
        val remote = api.listAttachments(tripId)
        if (remote.isEmpty()) {
            attachmentDao.deleteAllForTrip(tripId)
            return
        }
        val existingPaths = attachmentDao.getAllForTrip(tripId).associate { it.id to it.localPath }
        attachmentDao.upsertAll(remote.map { it.toEntity(localPath = existingPaths[it.id]) })
        attachmentDao.deleteMissing(tripId, remote.map { it.id })
    }

    private suspend fun syncPhotoMetadata(tripId: String) {
        val remote = api.listPhotos(tripId)
        if (remote.isEmpty()) {
            photoDao.deleteAllForTrip(tripId)
            return
        }
        val existingPaths = photoDao.getAllForTrip(tripId).associate { it.id to it.localPath }
        photoDao.upsertAll(remote.map { it.toEntity(localPath = existingPaths[it.id]) })
        photoDao.deleteMissing(tripId, remote.map { it.id })
    }

    private suspend fun cacheMissingFiles(tripId: String) {
        attachmentDao.getAllForTrip(tripId).filter { it.localPath == null }.forEach { attachment ->
            runCatching { fileCacheManager.downloadAttachment(attachment) }
                .onSuccess { path -> attachmentDao.setLocalPath(attachment.id, path) }
        }
        photoDao.getAllForTrip(tripId).filter { it.localPath == null }.forEach { photo ->
            runCatching { fileCacheManager.downloadPhoto(photo) }
                .onSuccess { path -> photoDao.setLocalPath(photo.id, path) }
        }
    }
}
