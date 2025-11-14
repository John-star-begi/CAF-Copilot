import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename") || `upload-${Date.now()}`;

    if (!request.body) {
      return NextResponse.json(
        { error: "No file in request body" },
        { status: 400 }
      );
    }

    const blob = await put(filename, request.body, {
      access: "public",
      addRandomSuffix: true,
    });

    // blob.url and blob.contentType are what we care about
    return NextResponse.json({
      url: blob.url,
      contentType: blob.contentType,
      pathname: blob.pathname,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upload failed", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
