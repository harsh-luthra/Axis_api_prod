export function Skeleton({ width = '100%', height = 14, radius = 4, style = {} }) {
  return (
    <span
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonRows({ count = 5, columns }) {
  return Array.from({ length: count }).map((_, i) => (
    <tr key={`skel-${i}`}>
      {columns.map((col, j) => (
        <td key={j}>
          {col === null ? null : (
            Array.isArray(col)
              ? col.map((c, k) => (
                <div key={k} style={{ marginTop: k === 0 ? 0 : 4 }}>
                  <Skeleton width={c.width} height={c.height} />
                </div>
              ))
              : <Skeleton width={col} />
          )}
        </td>
      ))}
    </tr>
  ));
}
