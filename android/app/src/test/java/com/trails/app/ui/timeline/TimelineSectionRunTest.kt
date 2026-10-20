package com.trails.app.ui.timeline

import com.trails.app.ui.timeline.graph.continuousRailEndpoints
import org.junit.Assert.assertEquals
import org.junit.Test

class TimelineSectionRunTest {
    @Test
    fun `rail always reaches both row edges without a visible gap`() {
        assertEquals(0f to 124f, continuousRailEndpoints(124f))
    }

    @Test
    fun `first middle and last rows classify only external run edges`() {
        assertEquals(SectionRunBoundary(roundsTop = true, roundsBottom = false), sectionRunBoundary(null, 2, 2))
        assertEquals(SectionRunBoundary(roundsTop = false, roundsBottom = false), sectionRunBoundary(2, 2, 2))
        assertEquals(SectionRunBoundary(roundsTop = false, roundsBottom = true), sectionRunBoundary(2, 2, null))
    }

    @Test
    fun `single row and adjacent sections round independently`() {
        assertEquals(SectionRunBoundary(true, true), sectionRunBoundary(null, 1, 2))
        assertEquals(SectionRunBoundary(true, true), sectionRunBoundary(1, 2, null))
        assertEquals(SectionRunBoundary(false, false), sectionRunBoundary(1, null, 2))
    }
}
