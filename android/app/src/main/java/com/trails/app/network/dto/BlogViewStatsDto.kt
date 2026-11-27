package com.trails.app.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class BlogViewStatsDto(val totalViews: Long, val countries: List<BlogCountryViewsDto>)

@Serializable
data class BlogCountryViewsDto(val countryCode: String, val views: Long)

@Serializable
data class TripBlogStatisticsDto(
    val today: String,
    val totalViews: Long,
    val posts: List<BlogPostStatisticsDto>,
    val countries: List<BlogCountryViewsDto>,
)

@Serializable
data class BlogPostStatisticsDto(
    val id: String,
    val title: String,
    val date: String,
    val totalViews: Long,
    val daily: List<BlogDailyViewsDto>,
)

@Serializable
data class BlogDailyViewsDto(val date: String, val views: Long)
