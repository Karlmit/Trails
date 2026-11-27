package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class BlogViewStatsDto(val totalViews: Long, val countries: List<BlogCountryViewsDto>)

@Serializable
data class BlogCountryViewsDto(val countryCode: String, val views: Long)
