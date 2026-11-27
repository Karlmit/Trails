package com.trails.app.ui.blog

import com.trails.app.network.dto.BlogDailyViewsDto
import com.trails.app.network.dto.BlogPostStatisticsDto
import com.trails.app.network.dto.TripBlogStatisticsDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BlogStatisticsTest {
    private val data = TripBlogStatisticsDto(
        today = "2026-11-27",
        totalViews = 40,
        posts = listOf(
            BlogPostStatisticsDto("a", "First", "2026-11-15", 26, listOf(
                BlogDailyViewsDto("2026-11-24", 2),
                BlogDailyViewsDto("2026-11-26", 4),
            )),
            BlogPostStatisticsDto("b", "Second", "2026-11-23", 14, listOf(
                BlogDailyViewsDto("2026-11-26", 3),
            )),
        ),
        countries = emptyList(),
    )

    @Test
    fun `trend fills missing days and aggregates posts without backfilling older totals`() {
        val trend = data.trend(30, null)
        assertEquals("2026-11-24", trend.first().date.toString())
        assertEquals(listOf(2L, 0L, 7L, 0L), trend.map { it.views })
        assertEquals(listOf(0L, 0L, 3L, 0L), data.trend(7, "b").map { it.views })
    }

    @Test
    fun `lifetime totals alone do not produce a trend`() {
        val legacy = data.copy(posts = data.posts.map { it.copy(daily = emptyList()) })
        assertTrue(legacy.trend(90, null).isEmpty())
    }
}
