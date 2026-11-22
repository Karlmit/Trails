package com.trails.app.network

import com.trails.app.di.NetworkModule
import com.trails.app.network.dto.BlogPostRequest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class BlogPostRequestTest {
    @Test
    fun `draft request sends the discriminator required by the create endpoint`() {
        val json = NetworkModule.provideJson()
        val request = BlogPostRequest(tripId = "trip", title = "Untitled", startAt = "2026-11-22")
        val body = json.encodeToJsonElement(BlogPostRequest.serializer(), request) as JsonObject

        assertEquals(JsonPrimitive("BLOG_POST"), body["entryType"])
        assertEquals(JsonPrimitive(false), body["isPrivate"])
    }
}
