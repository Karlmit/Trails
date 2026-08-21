package com.trails.app.network

import com.trails.app.network.dto.AttachmentDto
import com.trails.app.network.dto.BlogPostRequest
import com.trails.app.network.dto.ChecklistDto
import com.trails.app.network.dto.ChecklistItemDto
import com.trails.app.network.dto.ChecklistItemPatchRequest
import com.trails.app.network.dto.ChecklistItemRequest
import com.trails.app.network.dto.ChecklistRequest
import com.trails.app.network.dto.IdeaDto
import com.trails.app.network.dto.IdeaRequest
import com.trails.app.network.dto.ImportantInfoDto
import com.trails.app.network.dto.ImportantInfoRequest
import com.trails.app.network.dto.LinkDto
import com.trails.app.network.dto.LinkRequest
import com.trails.app.network.dto.LoginRequest
import com.trails.app.network.dto.LoginResponse
import com.trails.app.network.dto.PhotoDto
import com.trails.app.network.dto.SectionDto
import com.trails.app.network.dto.SectionRequest
import com.trails.app.network.dto.TagDto
import com.trails.app.network.dto.TagRequest
import com.trails.app.network.dto.TimelineEntryDto
import com.trails.app.network.dto.TimelineEntryRequest
import com.trails.app.network.dto.TripDto
import com.trails.app.network.dto.TripRequest
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

// One interface per the Trails API v1 contract -- every resource this app's
// screens need, both read and write. Every write call requires connectivity
// (this app is offline-*read*-only); ViewModels surface a clear error if one
// fails, never silently queuing it for later.
interface TrailsApiService {

    @POST("api/v1/auth")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    // 204 No Content on success -- ResponseBody (not a deserialized type)
    // avoids asking the JSON converter to decode an empty body.
    @DELETE("api/v1/auth")
    suspend fun logout(): Response<ResponseBody>

    @GET("api/v1/trips")
    suspend fun listTrips(): List<TripDto>

    @POST("api/v1/trips")
    suspend fun createTrip(@Body body: TripRequest): TripDto

    @PATCH("api/v1/trips/{id}")
    suspend fun updateTrip(@Path("id") id: String, @Body body: TripRequest): TripDto

    @DELETE("api/v1/trips/{id}")
    suspend fun deleteTrip(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/sections")
    suspend fun listSections(@Query("tripId") tripId: String): List<SectionDto>

    @POST("api/v1/sections")
    suspend fun createSection(@Body body: SectionRequest): SectionDto

    @PATCH("api/v1/sections/{id}")
    suspend fun updateSection(@Path("id") id: String, @Body body: SectionRequest): SectionDto

    @DELETE("api/v1/sections/{id}")
    suspend fun deleteSection(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/timeline-entries")
    suspend fun listTimelineEntries(@Query("tripId") tripId: String): List<TimelineEntryDto>

    @POST("api/v1/timeline-entries")
    suspend fun createTimelineEntry(@Body body: TimelineEntryRequest): TimelineEntryDto

    @PATCH("api/v1/timeline-entries/{id}")
    suspend fun updateTimelineEntry(@Path("id") id: String, @Body body: TimelineEntryRequest): TimelineEntryDto

    @DELETE("api/v1/timeline-entries/{id}")
    suspend fun deleteTimelineEntry(@Path("id") id: String): Response<ResponseBody>

    @POST("api/v1/timeline-entries")
    suspend fun createBlogPost(@Body body: BlogPostRequest): TimelineEntryDto

    @PATCH("api/v1/timeline-entries/{id}")
    suspend fun updateBlogPost(@Path("id") id: String, @Body body: BlogPostRequest): TimelineEntryDto

    @PUT("api/v1/timeline-entries/{id}/publish")
    suspend fun publishBlogPost(@Path("id") id: String): TimelineEntryDto

    @DELETE("api/v1/timeline-entries/{id}/publish")
    suspend fun unpublishBlogPost(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/checklists")
    suspend fun listChecklists(@Query("tripId") tripId: String): List<ChecklistDto>

    @POST("api/v1/checklists")
    suspend fun createChecklist(@Body body: ChecklistRequest): ChecklistDto

    @PATCH("api/v1/checklists/{id}")
    suspend fun updateChecklist(@Path("id") id: String, @Body body: ChecklistRequest): ChecklistDto

    @DELETE("api/v1/checklists/{id}")
    suspend fun deleteChecklist(@Path("id") id: String): Response<ResponseBody>

    @POST("api/v1/checklist-items")
    suspend fun createChecklistItem(@Body body: ChecklistItemRequest): ChecklistItemDto

    @PATCH("api/v1/checklist-items/{id}")
    suspend fun patchChecklistItem(@Path("id") id: String, @Body body: ChecklistItemPatchRequest): ChecklistItemDto

    @DELETE("api/v1/checklist-items/{id}")
    suspend fun deleteChecklistItem(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/important-info")
    suspend fun listImportantInfo(@Query("tripId") tripId: String): List<ImportantInfoDto>

    @POST("api/v1/important-info")
    suspend fun createImportantInfo(@Body body: ImportantInfoRequest): ImportantInfoDto

    @PATCH("api/v1/important-info/{id}")
    suspend fun updateImportantInfo(@Path("id") id: String, @Body body: ImportantInfoRequest): ImportantInfoDto

    @DELETE("api/v1/important-info/{id}")
    suspend fun deleteImportantInfo(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/ideas")
    suspend fun listIdeas(@Query("tripId") tripId: String): List<IdeaDto>

    @POST("api/v1/ideas")
    suspend fun createIdea(@Body body: IdeaRequest): IdeaDto

    @PATCH("api/v1/ideas/{id}")
    suspend fun updateIdea(@Path("id") id: String, @Body body: IdeaRequest): IdeaDto

    @DELETE("api/v1/ideas/{id}")
    suspend fun deleteIdea(@Path("id") id: String): Response<ResponseBody>

    @POST("api/v1/ideas/{id}/convert")
    suspend fun convertIdea(@Path("id") id: String): TimelineEntryDto

    @GET("api/v1/attachments")
    suspend fun listAttachments(@Query("tripId") tripId: String): List<AttachmentDto>

    @Multipart
    @POST("api/v1/attachments")
    suspend fun uploadAttachment(
        @Part("ownerType") ownerType: okhttp3.RequestBody,
        @Part("ownerId") ownerId: okhttp3.RequestBody,
        @Part file: MultipartBody.Part,
    ): AttachmentDto

    @DELETE("api/v1/attachments/{id}")
    suspend fun deleteAttachment(@Path("id") id: String): Response<ResponseBody>

    @Streaming
    @GET("api/v1/attachments/{id}/file")
    suspend fun downloadAttachment(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/photos")
    suspend fun listPhotos(@Query("tripId") tripId: String): List<PhotoDto>

    @Multipart
    @POST("api/v1/photos")
    suspend fun uploadPhoto(
        @Part("ownerType") ownerType: okhttp3.RequestBody,
        @Part("ownerId") ownerId: okhttp3.RequestBody,
        @Part file: MultipartBody.Part,
        @Part("isPrivate") isPrivate: okhttp3.RequestBody? = null,
    ): PhotoDto

    @DELETE("api/v1/photos/{id}")
    suspend fun deletePhoto(@Path("id") id: String): Response<ResponseBody>

    @PUT("api/v1/photos/{id}/primary")
    suspend fun markPhotoPrimary(@Path("id") id: String): PhotoDto

    @Streaming
    @GET("api/v1/photos/{id}/file")
    suspend fun downloadPhoto(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/links")
    suspend fun listLinks(@Query("ownerType") ownerType: String, @Query("ownerId") ownerId: String): List<LinkDto>

    @POST("api/v1/links")
    suspend fun createLink(@Body body: LinkRequest): LinkDto

    @DELETE("api/v1/links/{id}")
    suspend fun deleteLink(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/tags")
    suspend fun listTags(@Query("ownerType") ownerType: String, @Query("ownerId") ownerId: String): List<TagDto>

    @POST("api/v1/tags")
    suspend fun createTag(@Body body: TagRequest): TagDto

    @DELETE("api/v1/tags/{id}")
    suspend fun deleteTag(@Path("id") id: String): Response<ResponseBody>
}
