package com.trails.app.ui.timeline

import com.trails.app.ui.timeline.graph.continuousRailEndpoints
import org.junit.Assert.assertEquals
import org.junit.Test

class TimelineSectionRunTest {
    @Test
    fun `rail always reaches both row edges without a visible gap`() {
        assertEquals(0f to 124f, continuousRailEndpoints(124f, false, false, 18f))
        assertEquals(18f to 106f, continuousRailEndpoints(124f, true, true, 18f))
    }

    @Test
    fun `only overall trip boundaries are rounded`() {
        assertEquals(SectionRunBoundary(roundsTop = true, roundsBottom = false), tripBandBoundary(0, 3))
        assertEquals(SectionRunBoundary(roundsTop = false, roundsBottom = false), tripBandBoundary(1, 3))
        assertEquals(SectionRunBoundary(roundsTop = false, roundsBottom = true), tripBandBoundary(2, 3))
    }

    @Test
    fun `single row rounds both outer edges`() {
        assertEquals(SectionRunBoundary(true, true), tripBandBoundary(0, 1))
    }
}
