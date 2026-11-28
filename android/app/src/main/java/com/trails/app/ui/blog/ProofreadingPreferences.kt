package com.trails.app.ui.blog

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProofreadingPreferences @Inject constructor(@ApplicationContext context: Context) {
    private val preferences = context.getSharedPreferences("proofreading", Context.MODE_PRIVATE)
    private val keyFile = File(context.noBackupFilesDir, "proofreading-openai-key")

    internal var useChatGpt: Boolean
        get() = preferences.getBoolean("use_chatgpt", false)
        set(value) = preferences.edit().putBoolean("use_chatgpt", value).apply()

    internal val hasApiKey: Boolean
        get() = keyFile.isFile

    @Synchronized
    internal fun readApiKey(): String? {
        if (!hasApiKey) return null
        val encrypted = keyFile.readBytes()
        check(encrypted.size > IV_LENGTH)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            keyStore().getKey(KEY_ALIAS, null) as SecretKey,
            GCMParameterSpec(128, encrypted, 0, IV_LENGTH),
        )
        return cipher.doFinal(encrypted, IV_LENGTH, encrypted.size - IV_LENGTH).decodeToString()
    }

    @Synchronized
    internal fun saveApiKey(value: String) {
        val storedKey = keyStore().getKey(KEY_ALIAS, null) as SecretKey?
        val key = storedKey ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
            generateKey()
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        check(cipher.iv.size == IV_LENGTH)
        val encrypted = cipher.iv + cipher.doFinal(value.encodeToByteArray())
        val pending = File.createTempFile("proofreading-key-", ".tmp", keyFile.parentFile)
        try {
            FileOutputStream(pending).use { stream ->
                stream.write(encrypted)
                stream.fd.sync()
            }
            Files.move(pending.toPath(), keyFile.toPath(), StandardCopyOption.ATOMIC_MOVE)
        } finally {
            pending.delete()
        }
    }

    @Synchronized
    internal fun removeApiKey() {
        // Removing the wrapping key also makes any leftover ciphertext unreadable.
        keyStore().deleteEntry(KEY_ALIAS)
        Files.deleteIfExists(keyFile.toPath())
    }

    private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private companion object {
        const val KEY_ALIAS = "trails-proofreading-openai"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LENGTH = 12
    }
}
