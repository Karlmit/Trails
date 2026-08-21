package com.trails.app.network

import com.trails.app.network.dto.AttachmentDto
import com.trails.app.network.dto.ChecklistDto
import com.trails.app.network.dto.ChecklistItemPatchRequest
import com.trails.app.network.dto.ChecklistItemDto
import com.trails.app.network.dto.IdeaDto
import com.trails.app.network.dto.ImportantInfoDto
import com.trails.app.network.dto.LoginRequest
import com.trails.app.network.dto.LoginResponse
import com.trails.app.network.dto.PhotoDto
import com.trails.app.network.dto.SectionDto
import com.trails.app.network.dto.TimelineEntryDto
import com.trails.app.network.dto.TripDto
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

// One interface per the Trails API v1 contract. Covers every resource this
// app's offline-read-only screens need; write-capable calls are limited to
// the one online-only action this app supports (checklist-item toggle) --
// everything else is GET.
interface TrailsApiService {

    @POST("api/v1/auth")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    // 204 No Content on success -- ResponseBody (not a deserialized type)
    // avoids asking the JSON converter to decode an empty body.
    @DELETE("api/v1/auth")
    suspend fun logout(): Response<ResponseBody>

    @GET("api/v1/trips")
    suspend fun listTrips(): List<TripDto>

    @GET("api/v1/sections")
    suspend fun listSections(@Query("tripId") tripId: String): List<SectionDto>

    @GET("api/v1/timeline-entries")
    suspend fun listTimelineEntries(@Query("tripId") tripId: String): List<TimelineEntryDto>

    @GET("api/v1/checklists")
    suspend fun listChecklists(@Query("tripId") tripId: String): List<ChecklistDto>

    @PATCH("api/v1/checklist-items/{id}")
    suspend fun patchChecklistItem(@Path("id") id: String, @Body body: ChecklistItemPatchRequest): ChecklistItemDto

    @GET("api/v1/important-info")
    suspend fun listImportantInfo(@Query("tripId") tripId: String): List<ImportantInfoDto>

    @GET("api/v1/ideas")
    suspend fun listIdeas(@Query("tripId") tripId: String): List<IdeaDto>

    @GET("api/v1/attachments")
    suspend fun listAttachments(@Query("tripId") tripId: String): List<AttachmentDto>

    @Streaming
    @GET("api/v1/attachments/{id}/file")
    suspend fun downloadAttachment(@Path("id") id: String): Response<ResponseBody>

    @GET("api/v1/photos")
    suspend fun listPhotos(@Query("tripId") tripId: String): List<PhotoDto>

    @Streaming
    @GET("api/v1/photos/{id}/file")
    suspend fun downloadPhoto(@Path("id") id: String): Response<ResponseBody>
}
