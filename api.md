# API reference

Base URL: `http://localhost:3000` & `https://gcgocsaiph.vercel.app`. Body request JSON (`Content-Type: application/json`).

- Postman collection: https://documenter.getpostman.com/view/60024070/2sBYHYuHr7

Endpoint dengan **auth** butuh header `Authorization: Bearer <token>`. Tanpa token, responsenya `401 Unauthorized`. Token yang tidak valid atau kedaluwarsa mendapat `403 Forbidden`. Contoh error msg:

```json
{ "error": "Internal Server Error" }
```

Error database atau Gemini yang masuk ke blok `catch` handler return body `500`. Body JSON yang invalid ditolak `express.json()` dengan `400` dan halaman error HTML bawaan Express. Error di luar blok `catch` pakai default error handler Express.

Endpoint tanpa **auth** bisa diakses tanpa token. Semua list response berupa array langsung, tanpa pagination atau wrapper `data`. Request body memakai `movieId`, sedangkan response memakai `movie_id`. Field `created_at` adalah timestamp ISO 8601.

## Auth

### `POST /api/auth/register`

```json
{ "email": "sigma@example.com", "password": "tes123!" }
```

Field `email` dan `password` wajib string; `email` tidak boleh hanya berisi whitespace dan `password` tidak boleh kosong. Password tidak ditrim. Email disimpan setelah ditrim dan diubah ke huruf kecil. Username diambil dari bagian email input sebelum `@`, lalu ditrim tanpa diubah ke huruf kecil. Field `username` di body diabaikan.

Response register:

`201`

```json
{ "token": "<jwt>" }
```

| Status | `error`                           |
| ------ | --------------------------------- |
| `400`  | `Email and password are required` |
| `400`  | `Email already in use`            |

### `POST /api/auth/login`

```json
{ "email": "sigma@example.com", "password": "tes123!" }
```

Validasi field sama seperti register. Email ditrim sebelum dicompare dengan case insensitive.

`200`

```json
{
    "token": "<jwt>",
    "user": { "id": 1, "username": "sigma", "email": "sigma@example.com" }
}
```

| Status | `error`                           |
| ------ | --------------------------------- |
| `400`  | `Email and password are required` |
| `401`  | `Invalid email or password`       |

Token dari register dan login memuat `id`, `email`, serta `iat` dan `exp` yang include dari `jsonwebtoken`. Expired time sesuai `EXP_TIME` (default `1h`).

## Movies

Movie object:

```json
{
    "id": 1,
    "title": "Inception",
    "year": 2010,
    "director": "Christopher Nolan",
    "genres": ["Sci-Fi", "Action", "Thriller"],
    "rating": "8.8",
    "duration": "148 min",
    "synopsis": "Seorang pencuri ulung ...",
    "poster_url": "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
    "cast_members": ["Leonardo DiCaprio", "Joseph Gordon-Levitt"],
    "cast": ["Leonardo DiCaprio", "Joseph Gordon-Levitt"]
}
```

### `GET /api/movies`

| Query    | Behavior                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `genre`  | (case-sensitive) dengan salah satu isi `genres`, misalnya `Sci-Fi`                                                        |
| `search` | Mencari potongan teks di `title` secara case-insensitive dengan `ILIKE`; `%` dan `_` tetap berfungsi sebagai SQL wildcard |

Keduanya opsional. Kalau diisi bersamaan: AND. Hasil diurutkan berdasarkan `id ASC`. Contoh: `GET /api/movies?genre=Sci-Fi&search=Inception`.

`200`: array object film, atau `[]` kalau tidak ada yang cocok.

### `GET /api/movies/:id`

`200`: satu object film.

| Status | `error`           |
| ------ | ----------------- |
| `404`  | `Movie not found` |

Path parameter diparse dengan `parseInt(value, 10)`. `abc` jadi `NaN` dan return `500`, tetapi `1abc` dan `1.5` dibaca `1`.

## Watchlist

### `GET /api/watchlist` (auth)

`200`: watchlist milik user yang sedang login, diurutkan berdasarkan `created_at DESC`, lalu `movie_id ASC`. Hasilnya `[]` jika belum ada entri.

```json
[
    {
        "user_id": 1,
        "movie_id": 1,
        "created_at": "2026-11-06T10:00:00.000Z",
        "movie": { "id": 1, "title": "Inception" }
    }
]
```

`movie` berisi semua kolom tabel `movies` (dipersingkat di contoh ini). Beda dengan movie object di atas, tidak ada alias `cast`; daftar pemain ada di `cast_members`.

### `POST /api/watchlist` (auth)

```json
{ "movieId": 1 }
```

`movieId` wajib integer positif. Nilai `"1"` dalam bentuk string ditolak.

`201`

```json
{ "user_id": 1, "movie_id": 1, "created_at": "2026-11-06T10:00:00.000Z" }
```

| Status | `error`                       |
| ------ | ----------------------------- |
| `400`  | `A valid movieId is required` |
| `400`  | `Movie already in watchlist`  |
| `404`  | `Movie not found`             |

### `DELETE /api/watchlist/:movieId` (auth)

`204`, tanpa body.

| Status | `error`                        |
| ------ | ------------------------------ |
| `404`  | `Movie not found in watchlist` |

Path parameter diparse dengan `parseInt(value, 10)` seperti `GET /api/movies/:id`, jadi `abc` return `500`.

## Watched

### `GET /api/watched` (auth)

`200`: review milik user yang login, sorted by `created_at` lalu `id`, dari yang terbaru. Hasil: `[]` jika belum ada review. Nested `movie` sama seperti di watchlist (tanpa `cast`), disingkat di contoh:

```json
[
    {
        "id": 3,
        "user_id": 1,
        "movie_id": 1,
        "rating": 5,
        "review": "Premisnya menarik.",
        "created_at": "2026-11-06T10:00:00.000Z",
        "movie": { "id": 1, "title": "Inception" }
    }
]
```

### `POST /api/watched` (auth)

```json
{ "movieId": 1, "rating": 5, "review": "Premisnya menarik." }
```

| Field     | Rule                                         |
| --------- | -------------------------------------------- |
| `movieId` | Positive integer                             |
| `rating`  | Integer 1 - 5                                |
| `review`  | String tidak kosong, disimpan setelah ditrim |

`movieId` dan `rating` harus integer. Nilai `"5"` dalam bentuk string ditolak.

Kalau user sudah pernah mereview film itu, row yang lama diperbarui. `rating` dan `review` berubah, sedangkan `id` dan `created_at` tetap. Kedua kasus return `201` dengan rownya.

```json
{
    "id": 3,
    "user_id": 1,
    "movie_id": 1,
    "rating": 5,
    "review": "Rispek.",
    "created_at": "2026-11-06T10:00:00.000Z"
}
```

| Status | `error`                                                  |
| ------ | -------------------------------------------------------- |
| `400`  | `A valid movieId, rating (1-5), and review are required` |
| `404`  | `Movie not found`                                        |

## Recommendation

### `POST /api/movies/recommend` (auth)

```json
{ "prompt": "Mau film sci-fi yang bikin mikir dan ada twist-nya." }
```

`200`

```json
{
    "movie_id": 1,
    "reasoning": "Inception cocok karena ..."
}
```

`prompt` wajib string yang tidak kosong. Pada response sukses, `movie_id` dicompare dengan daftar film dari database. Model pasti menulis `reasoning` dalam bindo.

Limitnya 5 request per 60 detik per user. Response menyertakan header `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining`, dan `RateLimit-Reset`. Limiter jalan setelah auth dan sebelum validasi prompt, response `400` tetap terhitung.

| Status | `error`                                                               |
| ------ | --------------------------------------------------------------------- |
| `400`  | `Prompt is required`                                                  |
| `429`  | `Rate limit exceeded.`                                                |
| `502`  | `AI returned an unknown movie`                                        |
| `500`  | `Internal Server Error` (Gemini gagal atau output tidak bisa diparse) |
