package com.trails.app.ui.documents

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DownloadGateTest {
    @Test
    fun `duplicate starts are rejected until cleanup`() {
        val gate = DownloadGate()
        assertTrue(gate.tryStart("attachment"))
        assertFalse(gate.tryStart("attachment"))
        gate.finish("attachment")
        assertTrue(gate.tryStart("attachment"))
    }
}
