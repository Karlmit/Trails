package com.trails.app.data

import com.trails.app.network.TrailsApiService
import com.trails.app.network.dto.LinkDto
import com.trails.app.network.dto.LinkRequest
import com.trails.app.network.dto.TagDto
import com.trails.app.network.dto.TagRequest
import javax.inject.Inject
import javax.inject.Singleton

// Links/Tags are never mirrored into Room: they only matter while a resource
// is being viewed/edited online, so every call here hits the network fresh
// rather than adding an offline cache surface nothing offline-only needs.
@Singleton
class LinksTagsRepository @Inject constructor(
    private val api: TrailsApiService,
) {
    suspend fun listLinks(ownerType: String, ownerId: String): List<LinkDto> = api.listLinks(ownerType, ownerId)

    suspend fun createLink(ownerType: String, ownerId: String, url: String, label: String?): LinkDto =
        api.createLink(LinkRequest(ownerType = ownerType, ownerId = ownerId, url = url, label = label))

    suspend fun deleteLink(linkId: String) = api.deleteLink(linkId)

    suspend fun listTags(ownerType: String, ownerId: String): List<TagDto> = api.listTags(ownerType, ownerId)

    suspend fun createTag(ownerType: String, ownerId: String, text: String): TagDto =
        api.createTag(TagRequest(ownerType = ownerType, ownerId = ownerId, text = text))

    suspend fun deleteTag(tagId: String) = api.deleteTag(tagId)
}
