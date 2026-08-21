package com.trails.app.network

import com.trails.app.network.dto.LoginRequest
import com.trails.app.network.dto.LoginResponse
import com.trails.app.network.dto.SectionDto
import com.trails.app.network.dto.TimelineEntryDto
import com.trails.app.network.dto.TripDto
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

// One interface per the Trails API v1 contract (see the Phase 0/1 plan) --
// only the endpoints Phase 1's vertical slice (login, trip list, one trip's
// Sections/TimelineEntries) needs. Later phases add the rest of the
// resources (checklists, important-info, ideas, attachments, photos, ...)
// here as their screens get built.
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
}
