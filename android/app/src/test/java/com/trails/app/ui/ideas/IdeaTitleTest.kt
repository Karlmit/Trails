package com.trails.app.ui.ideas

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class IdeaTitleTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun `complete long title remains in content semantics`() {
        val title = "En mycket lång idé för en destination som behöver flera rader på en smal skärm"
        composeRule.setContent { MaterialTheme { IdeaTitle(title) } }

        composeRule.onNodeWithText(title, substring = false).assertIsDisplayed()
    }
}
