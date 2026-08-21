package com.trails.app.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateCheckerVersionTest {

    @Test
    fun `extracts a dotted version from a tag regardless of prefix`() {
        assertEquals("0.1.0", UpdateChecker.versionFromTag("android-v0.1.0"))
        assertEquals("2.3", UpdateChecker.versionFromTag("app-v2.3"))
        assertNull(UpdateChecker.versionFromTag("latest"))
    }

    @Test
    fun `a strictly higher version is newer`() {
        assertTrue(UpdateChecker.isNewer(remote = "0.2.0", installed = "0.1.0"))
        assertTrue(UpdateChecker.isNewer(remote = "1.0", installed = "0.9.9"))
    }

    @Test
    fun `missing trailing components are treated as zero, not compared as strings`() {
        // A naive string/lexicographic compare would get this backwards.
        assertTrue(UpdateChecker.isNewer(remote = "1.10", installed = "1.2"))
    }

    @Test
    fun `equal or older versions are never newer`() {
        assertFalse(UpdateChecker.isNewer(remote = "0.1.0", installed = "0.1.0"))
        assertFalse(UpdateChecker.isNewer(remote = "0.1.0", installed = "0.2.0"))
    }
}
