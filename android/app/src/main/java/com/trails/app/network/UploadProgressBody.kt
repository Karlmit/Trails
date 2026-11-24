package com.trails.app.network

import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer

internal class UploadProgressBody(
    private val body: RequestBody,
    private val onBytesSent: (Long) -> Unit,
) : RequestBody() {
    override fun contentType() = body.contentType()
    override fun contentLength() = body.contentLength()
    override fun isOneShot() = body.isOneShot()

    override fun writeTo(sink: BufferedSink) {
        var sent = 0L
        onBytesSent(sent)
        val reportingSink = object : ForwardingSink(sink) {
            override fun write(source: Buffer, byteCount: Long) {
                super.write(source, byteCount)
                sent += byteCount
                onBytesSent(sent)
            }
        }.buffer()
        body.writeTo(reportingSink)
        reportingSink.emit()
    }
}
